import express from "express";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ✅ Root
app.get("/", (req, res) => {
    res.send("Healthcare MCP Server Running ✅");
});

// ✅ MCP metadata
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
                    properties: {
                        patient_id: { type: "string" }
                    },
                    required: ["patient_id"]
                }
            }
        ]
    });
});

// ✅ JSON-RPC MCP handler
app.post("/", (req, res) => {
    const { method, params, id } = req.body;

    console.log("MCP Request:", req.body);

    // 1️⃣ Initialize
    if (method === "initialize") {
        return res.json({
            jsonrpc: "2.0",
            id,
            result: {
                protocolVersion: "2025-11-25",
                capabilities: {
                    tools: {}
                },
                serverInfo: {
                    name: "Healthcare MCP",
                    version: "1.0.0"
                }
            }
        });
    }

    // 2️⃣ List tools
    if (method === "tools/list") {
        return res.json({
            jsonrpc: "2.0",
            id,
            result: {
                tools: [
                    {
                        name: "get_patient_summary",
                        description: "Fetch patient summary",
                        inputSchema: {
                            type: "object",
                            properties: {
                                patient_id: { type: "string" }
                            },
                            required: ["patient_id"]
                        }
                    }
                ]
            }
        });
    }

    // 3️⃣ Call tool
    if (method === "tools/call") {
        const { name, arguments: args } = params || {};

        if (name === "get_patient_summary") {
            const { patient_id } = args || {};

            return res.json({
                jsonrpc: "2.0",
                id,
                result: {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                patient_id,
                                conditions: ["Diabetes"],
                                medications: ["Metformin"],
                                allergies: ["Penicillin"],
                                summary: `Patient ${patient_id} has diabetes and is taking Metformin.`
                            })
                        }
                    ]
                }
            });
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

    // ❌ Unknown method
    return res.json({
        jsonrpc: "2.0",
        id,
        error: {
            code: -32601,
            message: "Method not found"
        }
    });
});

// ✅ Health check
app.get("/healthz", (req, res) => {
    res.send("OK");
});

app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
});
