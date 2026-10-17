import express from "express";
import dotenv from "dotenv";
import OpenAI from "openai";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();
const app = express();
const PORT = Number(process.env.PORT || 3000);
const root = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(root, "public")));

// ChatGPT/OpenAI API runs on the server; the secret key is never sent to the browser.
app.post("/api/chat", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        error: "Chưa có OPENAI_API_KEY. Hãy tạo file .env từ .env.example và thêm API key."
      });
    }

    const input = Array.isArray(req.body.messages) ? req.body.messages : [];
    const messages = input
      .filter(m => m && ["user", "assistant"].includes(m.role) && typeof m.content === "string")
      .slice(-20)
      .map(m => ({ role: m.role, content: m.content.slice(0, 12000) }));

    if (!messages.some(m => m.role === "user")) {
      return res.status(400).json({ error: "Hãy nhập tin nhắn trước nhé." });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const result = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [{
        role: "system",
        content: `Bạn là Solia AI, trợ lý AI hữu ích, thân thiện và ưu tiên tiếng Việt.
Bạn có thể trò chuyện, giải thích, viết/sửa HTML, CSS, JavaScript, Lua, Python và các ngôn ngữ khác.
Khi viết mã, hãy dùng code fence có tên ngôn ngữ, code rõ ràng và giải thích cách chạy ngắn gọn.
Không nói rằng bạn đã chạy thử nếu chưa thực sự chạy. Không yêu cầu người dùng gửi API key vào chat.`
      }, ...messages],
      temperature: 0.7
    });

    res.json({ reply: result.choices?.[0]?.message?.content || "Mình chưa tạo được câu trả lời, hãy thử lại nhé." });
  } catch (error) {
    console.error("AI request failed:", error?.message || error);
    const status = Number.isInteger(error?.status) ? error.status : 500;
    res.status(status).json({
      error: status === 401
        ? "API key không hợp lệ. Kiểm tra OPENAI_API_KEY trong .env."
        : status === 429
        ? "API đang giới hạn hoặc hết quota. Kiểm tra usage/billing của tài khoản API."
        : "Không gọi được AI. Kiểm tra mạng, model và cấu hình API rồi thử lại."
    });
  }
});

// Search public GitHub repositories as references. This does not train the model.
app.get("/api/github", async (req, res) => {
  try {
    const q = String(req.query.q || "HTML CSS JavaScript AI").slice(0, 150);
    const url = new URL("https://api.github.com/search/repositories");
    url.searchParams.set("q", q);
    url.searchParams.set("sort", "stars");
    url.searchParams.set("order", "desc");
    url.searchParams.set("per_page", "6");

    const response = await fetch(url, {
      headers: { "Accept": "application/vnd.github+json", "User-Agent": "SoliaAI-Demo" }
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    const data = await response.json();
    res.json({
      items: (data.items || []).map(repo => ({
        name: repo.full_name,
        description: repo.description || "Không có mô tả",
        url: repo.html_url,
        stars: repo.stargazers_count,
        language: repo.language || "Chưa xác định"
      }))
    });
  } catch {
    res.status(502).json({ error: "Không tìm kiếm được GitHub lúc này." });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true, app: "Solia AI" }));
app.listen(PORT, () => console.log(`Solia AI chạy tại http://localhost:${PORT}`));