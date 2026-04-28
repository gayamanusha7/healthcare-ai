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

// 🔧 Header helper
const getHeader = (req, key) =>
  req.headers[key] ||
  req.headers[key.toLowerCase()] ||
  req.headers[key.toUpperCase()];

// 🔧 JWT decode (fallback)
function decodeJwtPayload(token) {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
  } catch {
    return {};
  }
}

// 🔧 Find patient fallback
async function findPatientIdByName(fhirBase, token, given, family) {
  if (!given && !family) return null;

  const url = `${fhirBase}/Patient?name=${encodeURIComponent(
    `${given} ${family}`
  )}&_count=5`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const data = await res.json();
  return data.entry?.[0]?.resource?.id || null;
}

// 🔥 MAIN HANDLER
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

    // ✅ Notifications
    if (method === "notifications/initialized") {
      return res.json({ jsonrpc: "2.0", result: {} });
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

    // ❌ Not tools/call → ignore safely
    if (method !== "tools/call") {
      return res.json({
        jsonrpc: "2.0",
        id: id || 1,
        result: {}
      });
    }

    // 🔥 SAFE PARAM CHECK (FIXED)
    if (!params || params.name !== "get_patient_summary") {
      console.log("⚠️ Invalid params:", params);

      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: "Invalid tool request"
            }
          ]
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
      patientId = await findPatientIdByName(
        fhirBase,
        token,
        payload?.given_name,
        payload?.family_name
      );
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
    const pRes = await fetch(`${fhirBase}/Patient/${patientId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (pRes.status === 403) {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: "Access denied for this patient. Please reselect."
            }
          ]
        }
      });
    }

    const patient = await pRes.json();

    const name =
      (patient.name?.[0]?.given?.join(" ") || "") +
      " " +
      (patient.name?.[0]?.family || "");

    const gender = patient.gender || "Unknown";
    const dob = patient.birthDate || "Unknown";

    // 🔹 Conditions
    let conditions = [];
    try {
      const cRes = await fetch(
        `${fhirBase}/Condition?patient=${patientId}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      const cData = await cRes.json();

      conditions =
        cData.entry?.map(
          (c) => c.resource.code?.text || "Unknown"
        ) || [];
    } catch (e) {
      console.error("❌ Condition error:", e.message);
    }

    // 🔥 Summary
    const summaryText =
      conditions.length === 0
        ? `${name.trim()} has no known medical conditions recorded.`
        : `${name.trim()} has ${conditions.join(", ")}.`;

    console.log("FINAL TEXT:", summaryText);

    // ✅ FINAL RESPONSE (always returns content)
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
