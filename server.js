import express from "express";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// MCP metadata
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

// Tool endpoint
app.post("/tools/get_patient_summary", (req, res) => {
    const { patient_id } = req.body;

    res.json({
        patient_id,
        conditions: ["Diabetes"],
        medications: ["Metformin"],
        allergies: ["Penicillin"]
    });
});

app.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
});