
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import RunwayML from "@runwayml/sdk";

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "../public")));

const runway = new RunwayML();

// Basic request limit to help protect API usage.
const requests = new Map();
const ONE_HOUR = 60 * 60 * 1000;

function allowRequest(ip) {
  const now = Date.now();
  const previous = requests.get(ip) || [];
  const recent = previous.filter(time => now - time < ONE_HOUR);

  if (recent.length >= 3) return false;

  recent.push(now);
  requests.set(ip, recent);
  return true;
}

// Create a 10-second AI video.
app.post("/api/generate", async (req, res) => {
  try {
    if (!process.env.RUNWAYML_API_SECRET) {
      return res.status(503).json({
        error: "Video service is not configured yet."
      });
    }

    if (!allowRequest(req.ip)) {
      return res.status(429).json({
        error: "Please wait before creating another video."
      });
    }

    const prompt = String(req.body.prompt || "").trim();

    if (!prompt || prompt.length > 1000) {
      return res.status(400).json({
        error: "Enter a prompt of 1 to 1000 characters."
      });
    }

    const ratio =
      req.body.ratio === "720:1280"
        ? "720:1280"
        : "1280:720";

    const task = await runway.textToVideo.create({
      model: "gen4.5",
      promptText: prompt,
      ratio,
      duration: 10
    });

    return res.json({
      id: task.id,
      status: "PENDING"
    });

  } catch (error) {
    console.error("Video generation error:", error.message);

    return res.status(500).json({
      error: "Video could not be started. Please try again."
    });
  }
});

// Check video generation status.
app.get("/api/status/:id", async (req, res) => {
  try {
    const taskId = req.params.id;

    if (!/^[a-zA-Z0-9-]{10,100}$/.test(taskId)) {
      return res.status(400).json({
        error: "Invalid task ID."
      });
    }

    const task = await runway.tasks.retrieve(taskId);

    return res.json({
      id: task.id,
      status: task.status,
      videoUrl:
        task.status === "SUCCEEDED"
          ? task.output?.[0]
          : null,
      error:
        task.status === "FAILED"
          ? "Video generation failed."
          : null
    });

  } catch (error) {
    console.error("Status error:", error.message);

    return res.status(500).json({
      error: "Could not check video status."
    });
  }
});

app.listen(PORT, () => {
  console.log(`YourNizamo AI server running on port ${PORT}`);
});
