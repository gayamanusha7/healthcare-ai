import express from "express";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// 🟢 Health
app.get("/", (req, res) => {
    res.send("MCP Server Running 🚀");
});

// 🟢 MCP Metadata
app.get("/.well-known/mcp", (req, res) => {
    res.json({
        name: "Patient Summary MCP",
        version: "1.0.0",
        tools: [
            {
                name: "get_patient_summary",
                description: "Fetch patient summary",
                input_schema: {
                    type: "object",
                    properties: {},
                    required: []
                }
            }
        ]
    });
});

// 🔥 Helper to safely read headers
function getHeader(req, key) {
    return (
        req.headers[key] ||
        req.headers[key?.toLowerCase()] ||
        req.headers[key?.toUpperCase()]
    );
}

// 🟢 MCP handler
app.post("/", async (req, res) => {
    console.log("HEADERS:", req.headers);
    try {
        const { method, params, id } = req.body;

        if (method !== "tools/call") {
            return res.json({
                jsonrpc: "2.0",
                id,
                error: { message: "Unsupported method" }
            });
        }

        if (params?.name !== "get_patient_summary") {
            return res.json({
                jsonrpc: "2.0",
                id,
                error: { message: "Unknown tool" }
            });
        }

        // 🔥 FHIR HEADERS
        const fhirBase = getHeader(req, "x-fhir-server-url");
        const token = getHeader(req, "x-fhir-access-token");
        const patientId = getHeader(req, "x-patient-id");

        console.log("HEADERS:", req.headers);

        // ⚠️ Render fallback (if headers missing)
        if (!fhirBase || !patientId) {
            return res.json({
                jsonrpc: "2.0",
                id,
                result: {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                patient_id: "patient-123",
                                name: "Anusha Gayam",
                                conditions: ["Diabetes"],
                                summary: "Anusha Gayam has Diabetes"
                            })
                        }
                    ]
                }
            });
        }

        // 🔹 Fetch patient
        const patientRes = await fetch(`${fhirBase}/Patient/${patientId}`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const patient = await patientRes.json();

        const name =
            (patient.name?.[0]?.given?.join(" ") || "") +
            " " +
            (patient.name?.[0]?.family || "");

        // 🔹 Fetch conditions
        const condRes = await fetch(
            `${fhirBase}/Condition?patient=${patientId}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const condData = await condRes.json();

        const conditions =
            condData.entry?.map(c => c.resource.code?.text || "Unknown") || [];

        const result = {
            patient_id: patientId,
            name: name.trim() || "Unknown",
            conditions,
            summary:
                conditions.length > 0
                    ? `${name} has ${conditions.join(", ")}`
                    : `${name} has no recorded conditions`
        };

        return res.json({
            jsonrpc: "2.0",
            id,
            result: {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(result)
                    }
                ]
            }
        });

    } catch (error) {
        console.error("ERROR:", error.message);

        return res.json({
            jsonrpc: "2.0",
            id: 1,
            error: { message: "Server error" }
        });
    }
});

app.listen(PORT, () => {
    console.log(`MCP running on ${PORT}`);
});
