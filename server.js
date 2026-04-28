import express from "express";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// 🟢 Health
app.get("/", (req, res) => res.send("MCP Server Running 🚀"));
app.get("/healthz", (req, res) => res.send("OK"));

// 🟢 MCP Metadata
app.get("/.well-known/mcp", (req, res) => {
  res.json({
    name: "Patient Summary MCP",
    version: "1.0.0",
    tools: [
      {
        name: "get_patient_summary",
        description: "Fetch patient summary from FHIR",
        input_schema: {
          type: "object",
          properties: {},
          required: []
        }
      }
    ]
  });
});

// 🔧 Safe header getter
const getHeader = (req, key) =>
  req.headers[key] ||
  req.headers[key.toLowerCase()] ||
  req.headers[key.toUpperCase()];

// 🔧 Decode JWT
function decodeJwtPayload(token) {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
  } catch {
    return {};
  }
}

// 🔧 Find patient by name (fallback)
async function findPatientIdByName(fhirBase, token, given, family) {
  if (!given && !family) return null;

  const query = encodeURIComponent([given, family].join(" "));
  const url = `${fhirBase}/Patient?name=${query}&_count=5`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const data = await res.json();
  return data.entry?.[0]?.resource?.id || null;
}

// 🔥 MAIN MCP HANDLER
app.post("/", async (req, res) => {
  console.log("🔥 MCP HIT:", req.body);

  const { method, params, id } = req.body || {};

  try {
    // ✅ INITIALIZE
    if (method === "initialize") {
      return res.json({
        jsonrpc: "2.0",
        id: id || 1,
        result: {
          protocolVersion: "2025-11-25",
          capabilities: {
            tools: {},
            extensions: {
              "ai.promptopinion/fhir-context": {
                scopes: [
                  { name: "patient/Patient.rs", required: true },
                  { name: "patient/Condition.rs" }
                ]
              }
            }
          },
          serverInfo: {
            name: "Patient Summary MCP",
            version: "1.0.0"
          }
        }
      });
    }

    if (method === "notifications/initialized") {
      return res.json({
        jsonrpc: "2.0",
        result: {}
      });
    }

    // ✅ tools/list
    if (method === "tools/list") {
      return res.json({
        jsonrpc: "2.0",
        id: id || 1,
        result: {
          tools: [
            {
              name: "get_patient_summary",
              description: "Fetch patient summary from FHIR",
              inputSchema: {
                type: "object",
                properties: {},
                required: []
              }
            }
          ]
        }
      });
    }

    if (method !== "tools/call") {
      return res.json({
        jsonrpc: "2.0",
        id: id || 1,
        result: {}
      });
    }

    if (params?.name !== "get_patient_summary") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: "Unknown tool" }]
        }
      });
    }

    // 🔹 Headers
    const fhirBase = getHeader(req, "x-fhir-server-url");
    const token = getHeader(req, "x-fhir-access-token");
    let patientId = getHeader(req, "x-patient-id");

    console.log("📦 HEADERS:", { fhirBase, patientId });

    // 🔥 fallback patient resolve
    if (!patientId && token && fhirBase) {
      const payload = decodeJwtPayload(token);
      const given = payload?.given_name || "";
      const family = payload?.family_name || "";

      patientId = await findPatientIdByName(fhirBase, token, given, family);
    }

    if (!patientId) {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: "No patient selected or found"
            }
          ]
        }
      });
    }

    // 🔹 Fetch Patient
    let patient = {};
    const pRes = await fetch(`${fhirBase}/Patient/${patientId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    // ✅ 403 handling
    if (pRes.status === 403) {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: "Access denied for this patient. Please reselect the patient."
            }
          ]
        }
      });
    }

    patient = await pRes.json();

    const name =
      (patient.name?.[0]?.given?.join(" ") || "") +
      " " +
      (patient.name?.[0]?.family || "");

    const gender = patient.gender || "Unknown";
    const dob = patient.birthDate || "Unknown";

    // 🔹 Fetch Conditions
    let conditions = [];
    try {
      const cRes = await fetch(`${fhirBase}/Condition?patient=${patientId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const cData = await cRes.json();

      conditions =
        cData.entry?.map(
          (c) => c.resource.code?.text || "Unknown"
        ) || [];
    } catch (e) {
      console.error("❌ Condition fetch error:", e.message);
    }

    // 🔥 Better summary
    let summaryText = "";

    if (conditions.length === 0) {
      summaryText = `${name.trim()} has no known medical conditions recorded.`;
    } else {
      summaryText = `${name.trim()} has ${conditions.join(", ")}.`;
    }
    console.log("FINAL TEXT:", summaryText);
    // ✅ Final response (clear text)
    return res.json({
      jsonrpc: "2.0",
      id,
      result: {
        content: [
          {
            type: "text",
            text: `Patient Summary:

Name: ${name.trim() || "Unknown"}
Gender: ${gender}
DOB: ${dob}
Conditions: ${
              conditions.length > 0
                ? conditions.join(", ")
                : "No known conditions"
            }

${summaryText}`
            
          }
        ]
      }
    });

  } catch (error) {
    console.error("❌ SERVER ERROR:", error.message);

    return res.json({
      jsonrpc: "2.0",
      id,
      result: {
        content: [
          {
            type: "text",
            text: "Something went wrong. Please try again."
          }
        ]
      }
    });
  }
});

// 🟢 Start
app.listen(PORT, () => {
  console.log(`MCP Server running on ${PORT}`);
});
