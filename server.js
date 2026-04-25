import express from "express";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Root
app.get("/", (req, res) => {
    res.send("Healthcare MCP with FHIR Running ✅");
});

// MCP metadata
app.get("/.well-known/mcp", (req, res) => {
    res.json({
        name: "FHIR Patient Summary MCP",
        version: "2.0.0",
        description: "Fetch real patient data from FHIR server using SHARP context",
        tools: [
            {
                name: "get_patient_summary",
                description: "Fetch patient summary from FHIR server",
                input_schema: {
                    type: "object",
                    properties: {
                        patient_id: { type: "string" },
                        fhir_base_url: { type: "string" }
                    },
                    required: ["patient_id"]
                }
            }
        ]
    });
});

// JSON-RPC MCP handler
app.post("/", async (req, res) => {
    const { method, params, id } = req.body;

    console.log("MCP Request:", req.body);

    // Initialize
    if (method === "initialize") {
        return res.json({
            jsonrpc: "2.0",
            id,
            result: {
                protocolVersion: "2025-11-25",
                capabilities: {
                    tools: {},
                    extensions: {
                        "ai.promptopinion/fhir-context": {
                            scopes: [
                                {
                                    name: "patient/Patient.rs",
                                    required: true
                                },
                                {
                                    name: "patient/Condition.rs",
                                    required: false
                                }
                            ]
                        }
                    }
                },
                serverInfo: {
                    name: "FHIR Healthcare MCP",
                    version: "2.1.0"
                }
            }
        });
    }

    // List tools
    if (method === "tools/list") {
        return res.json({
            jsonrpc: "2.0",
            id,
            result: {
                tools: [
                    {
                        name: "get_patient_summary",
                        description: "Fetch patient data from FHIR server",
                        inputSchema: {
                            type: "object",
                            properties: {
                                patient_id: { type: "string" },
                                fhir_base_url: { type: "string" }
                            },
                            required: ["patient_id"]
                        }
                    }
                ]
            }
        });
    }

    // Call tool
    if (method === "tools/call") {
        const { name, arguments: args } = params || {};

        if (name === "get_patient_summary") {
            const patient_id = args?.patient_id;
            const baseUrl = args?.fhir_base_url || "https://hapi.fhir.org/baseR4";

            try {
                // Fetch Patient
                const patientRes = await fetch(`${baseUrl}/Patient/${patient_id}`);
                const patientData = await patientRes.json();

                // Extract name
                const nameObj = patientData.name?.[0];
                const patientName = nameObj
                    ? `${nameObj.given?.join(" ")} ${nameObj.family}`
                    : "Unknown";

                return res.json({
                    jsonrpc: "2.0",
                    id,
                    result: {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify({
                                    patient_id,
                                    name: patientName,
                                    source: baseUrl,
                                    note: "Real FHIR data fetched",
                                    summary: `Patient ${patientName} data retrieved from FHIR server.`
                                })
                            }
                        ]
                    }
                });

            } catch (error) {
                return res.json({
                    jsonrpc: "2.0",
                    id,
                    error: {
                        code: -32000,
                        message: "FHIR fetch failed",
                        details: error.message
                    }
                });
            }
        }

        return res.json({
            jsonrpc: "2.0",
            id,
            error: {
                code: -32601,
                message: "Tool not found"
            }
        });
    }

    return res.json({
        jsonrpc: "2.0",
        id,
        error: {
            code: -32601,
            message: "Method not found"
        }
    });
});

// Health check
app.get("/healthz", (req, res) => {
    res.send("OK");
});

app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
});
