import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./chat.css";

const Chat = () => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = { text: input, sender: "user" };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    const chatUrl = import.meta.env.VITE_CHAT_URL || "http://localhost:5001/chat";

    try {
      const res = await fetch(chatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message: input })
      });

      const data = await res.json();

      const botMessage = { 
        text: data.reply, 
        sender: "bot",
        data: data.data // Store raw data for sources
      };

      setMessages(prev => [...prev, botMessage]);

    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, {
        text: "Error connecting to the medical server. Please ensure the backend is running.",
        sender: "bot"
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="chat-container">
      <header>
        <h2>CuraLink AI</h2>
        <p>Intelligent Medical Research Assistant</p>
      </header>

      <div className="chat-box">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.sender}`}>
            {msg.sender === "bot" ? (
              <div className="bot-content">
                <h4>🧠 Overview</h4>
                <p>{msg.text.overview}</p>

                <h4>📚 Research</h4>
                <ul>
                  {msg.text.research.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>

                <h4>🧪 Clinical Trials</h4>
                <ul>
                  {msg.text.trials.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="user-content">{msg.text}</div>
            )}

            {msg.sender === "bot" && msg.data && (
              <div className="sources-section">
                <details>
                  <summary>View Sources ({msg.data.publications.length + msg.data.trials.length})</summary>
                  <div className="sources-content">
                    {msg.data.publications.length > 0 && (
                      <div className="source-group">
                        <p style={{ fontWeight: 600, fontSize: '0.8rem', marginTop: '10px' }}>📚 Publications</p>
                        {msg.data.publications.map((p, i) => (
                          <div key={i} className="source-item">
                            <a href={p.url || "#"} target="_blank" rel="noreferrer">{p.title}</a>
                            {p.year && <span style={{ color: '#64748b' }}> • {p.year}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    {msg.data.trials.length > 0 && (
                      <div className="source-group">
                        <p style={{ fontWeight: 600, fontSize: '0.8rem', marginTop: '10px' }}>🧪 Clinical Trials</p>
                        {msg.data.trials.map((t, i) => (
                          <div key={i} className="source-item">
                            <span>{t.title}</span>
                            <span style={{ 
                              marginLeft: '8px', 
                              fontSize: '0.7rem', 
                              padding: '2px 6px', 
                              background: t.status === 'Recruiting' ? '#dcfce7' : '#f1f5f9',
                              color: t.status === 'Recruiting' ? '#166534' : '#64748b',
                              borderRadius: '4px'
                            }}>{t.status}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="message bot">
            <div className="typing-dots">
              <div className="dot"></div>
              <div className="dot"></div>
              <div className="dot"></div>
            </div>
          </div>
        )}
      </div>

      <div className="input-box">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Ask a medical question..."
          disabled={isLoading}
        />
        <button onClick={sendMessage} disabled={isLoading}>
          {isLoading ? "Analyzing..." : "Send"}
        </button>
      </div>
    </div>
  );
};

export default Chat;
