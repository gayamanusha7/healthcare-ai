import express from "express";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ✅ Root GET (for browser check)
app.get("/", (req, res) => {
    res.send("Healthcare MCP Server Running ✅");
});

// ✅ MCP metadata (discovery)
app.get("/.well-known/mcp", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.json({
        name: "Patient Summary MCP",
        version: "1.0.0",
        tools: [
            {
                name: "get_patient_summary",
                description: "Fetch patient conditions, medications, allergies and summary",
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

// ✅ Direct tool endpoint (optional but useful)
app.post("/tools/get_patient_summary", (req, res) => {
    const { patient_id } = req.body;

    res.json({
        patient_id,
        conditions: ["Diabetes"],
        medications: ["Metformin"],
        allergies: ["Penicillin"],
        summary: `Patient ${patient_id} has diabetes and is taking Metformin.`
    });
});

// ✅ MCP main handler (THIS FIXES YOUR ERROR)
app.post("/", (req, res) => {
    try {
        const { tool, input } = req.body;

        if (tool === "get_patient_summary") {
            const { patient_id } = input || {};

            return res.json({
                patient_id,
                conditions: ["Diabetes"],
                medications: ["Metformin"],
                allergies: ["Penicillin"],
                summary: `Patient ${patient_id} has diabetes and is taking Metformin.`
            });
        }

        return res.status(400).json({
            error: "Unknown tool",
        });

    } catch (err) {
        return res.status(500).json({
            error: "Server error",
            details: err.message
        });
    }
});

// ✅ Health check (Render stability)
app.get("/healthz", (req, res) => {
    res.send("OK");
});

app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
});
