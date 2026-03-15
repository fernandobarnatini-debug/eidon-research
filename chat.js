// EIDON Research — AI Support Chat (DeepSeek V3 via OpenRouter)
(function() {
  let conversationHistory = [];

  async function getAIResponse(userMessage) {
    conversationHistory.push({ role: 'user', content: userMessage });

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: conversationHistory }),
      });

      const data = await response.json();

      if (!response.ok || !data.reply) {
        throw new Error(data.error || 'Failed');
      }

      conversationHistory.push({ role: 'assistant', content: data.reply });
      return data.reply;
    } catch (err) {
      console.error('Chat error:', err);
      return "Sorry, I'm having trouble connecting right now. Please try again in a moment, or browse our FAQ section for quick answers.";
    }
  }

  // ====== UI ======
  function createChatWidget() {
    const style = document.createElement('style');
    style.textContent = `
      #eidon-chat-bubble {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 56px;
        height: 56px;
        background: #D4AF37;
        border-radius: 50%;
        cursor: pointer;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease;
        box-shadow: 0 4px 16px rgba(212,175,55,0.35), 0 8px 32px rgba(0,0,0,0.1);
      }
      #eidon-chat-bubble:hover {
        transform: scale(1.08);
        box-shadow: 0 6px 24px rgba(212,175,55,0.45), 0 12px 40px rgba(0,0,0,0.12);
      }
      #eidon-chat-bubble:active { transform: scale(0.95); }
      #eidon-chat-bubble .bubble-icon { transition: transform 0.3s ease, opacity 0.3s ease; }
      #eidon-chat-bubble.open .bubble-chat { opacity: 0; transform: rotate(90deg) scale(0); }
      #eidon-chat-bubble.open .bubble-close { opacity: 1; transform: rotate(0) scale(1); }
      #eidon-chat-bubble .bubble-close { opacity: 0; transform: rotate(-90deg) scale(0); position: absolute; }

      #eidon-chat-window {
        position: fixed;
        bottom: 92px;
        right: 24px;
        width: 380px;
        max-width: calc(100vw - 32px);
        height: 520px;
        max-height: calc(100vh - 120px);
        background: white;
        border-radius: 16px;
        z-index: 9998;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-shadow: 0 8px 32px rgba(11,20,38,0.15), 0 2px 8px rgba(11,20,38,0.08);
        transform: scale(0.9) translateY(20px);
        opacity: 0;
        pointer-events: none;
        transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease;
        transform-origin: bottom right;
      }
      #eidon-chat-window.open {
        transform: scale(1) translateY(0);
        opacity: 1;
        pointer-events: all;
      }

      .chat-header {
        background: #0B1426;
        padding: 16px 20px;
        display: flex;
        align-items: center;
        gap: 12px;
        flex-shrink: 0;
      }
      .chat-avatar {
        width: 36px;
        height: 36px;
        background: #D4AF37;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: "DM Sans", sans-serif;
        font-weight: 800;
        font-size: 14px;
        color: #0B1426;
      }
      .chat-header-text h4 {
        color: white;
        font-family: "DM Sans", sans-serif;
        font-weight: 700;
        font-size: 14px;
        margin: 0;
        line-height: 1.2;
      }
      .chat-header-text p {
        color: rgba(255,255,255,0.5);
        font-size: 11px;
        margin: 2px 0 0;
      }
      .chat-status {
        width: 8px;
        height: 8px;
        background: #22c55e;
        border-radius: 50%;
        display: inline-block;
        margin-right: 4px;
        vertical-align: middle;
      }

      .chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: #f8f9fa;
      }
      .chat-messages::-webkit-scrollbar { width: 4px; }
      .chat-messages::-webkit-scrollbar-thumb { background: #d0d5dd; border-radius: 4px; }

      .chat-msg {
        max-width: 85%;
        padding: 10px 14px;
        border-radius: 12px;
        font-size: 13px;
        line-height: 1.55;
        word-wrap: break-word;
        animation: msgIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes msgIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .chat-msg.bot {
        background: white;
        color: #333;
        border: 1px solid #e5e5e5;
        align-self: flex-start;
        border-bottom-left-radius: 4px;
      }
      .chat-msg.user {
        background: #0B1426;
        color: white;
        align-self: flex-end;
        border-bottom-right-radius: 4px;
      }
      .chat-msg strong { font-weight: 700; }
      .chat-msg.bot strong { color: #0B1426; }
      .chat-msg.user strong { color: #D4AF37; }

      .chat-input-wrap {
        padding: 12px 16px;
        border-top: 1px solid #e5e5e5;
        display: flex;
        gap: 8px;
        background: white;
        flex-shrink: 0;
      }
      .chat-input {
        flex: 1;
        border: 1px solid #e5e5e5;
        border-radius: 8px;
        padding: 10px 14px;
        font-size: 13px;
        outline: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        transition: border-color 0.2s ease;
      }
      .chat-input:focus { border-color: #D4AF37; }
      .chat-input::placeholder { color: #aaa; }
      .chat-input:disabled { background: #f5f5f5; }
      .chat-send {
        width: 40px;
        height: 40px;
        background: #D4AF37;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.2s ease;
        flex-shrink: 0;
      }
      .chat-send:hover { background: #e8c84a; transform: scale(1.05); }
      .chat-send:active { transform: scale(0.95); }
      .chat-send:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

      .typing-dots {
        display: flex;
        gap: 4px;
        padding: 12px 14px;
        background: white;
        border: 1px solid #e5e5e5;
        border-radius: 12px;
        border-bottom-left-radius: 4px;
        align-self: flex-start;
        animation: msgIn 0.3s ease;
      }
      .typing-dots span {
        width: 6px;
        height: 6px;
        background: #ccc;
        border-radius: 50%;
        animation: typingBounce 1.2s ease-in-out infinite;
      }
      .typing-dots span:nth-child(2) { animation-delay: 0.15s; }
      .typing-dots span:nth-child(3) { animation-delay: 0.3s; }
      @keyframes typingBounce {
        0%, 80%, 100% { transform: translateY(0); }
        40% { transform: translateY(-6px); }
      }

      .quick-replies {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 4px;
      }
      .quick-reply {
        background: white;
        border: 1px solid #D4AF37;
        color: #0B1426;
        font-size: 11px;
        font-weight: 600;
        padding: 5px 12px;
        border-radius: 20px;
        cursor: pointer;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        transition: background 0.2s ease, transform 0.2s ease;
      }
      .quick-reply:hover { background: rgba(212,175,55,0.1); transform: scale(1.03); }

      .chat-notif {
        position: absolute;
        top: -2px;
        right: -2px;
        width: 16px;
        height: 16px;
        background: #ef4444;
        border-radius: 50%;
        border: 2px solid white;
        animation: notifPulse 2s ease-in-out infinite;
        display: none;
      }
      @keyframes notifPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.2); }
      }

      .powered-by {
        text-align: center;
        padding: 6px;
        font-size: 9px;
        color: #bbb;
        background: white;
        border-top: 1px solid #f0f0f0;
        flex-shrink: 0;
      }
    `;
    document.head.appendChild(style);

    // Chat bubble
    const bubble = document.createElement('div');
    bubble.id = 'eidon-chat-bubble';
    bubble.innerHTML = `
      <svg class="bubble-icon bubble-chat" width="24" height="24" fill="none" stroke="#0B1426" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <svg class="bubble-icon bubble-close" width="20" height="20" fill="none" stroke="#0B1426" stroke-width="2.5" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
      <div class="chat-notif" id="chat-notif"></div>
    `;
    document.body.appendChild(bubble);

    // Chat window
    const win = document.createElement('div');
    win.id = 'eidon-chat-window';
    win.innerHTML = `
      <div class="chat-header">
        <div class="chat-avatar">A</div>
        <div class="chat-header-text">
          <h4>Adam — EIDON Support</h4>
          <p><span class="chat-status"></span>Online 24/7</p>
        </div>
      </div>
      <div class="chat-messages" id="chat-messages"></div>
      <div class="chat-input-wrap">
        <input class="chat-input" id="chat-input" type="text" placeholder="Ask about products, shipping, peptides..." autocomplete="off">
        <button class="chat-send" id="chat-send" aria-label="Send message">
          <svg width="18" height="18" fill="none" stroke="#0B1426" stroke-width="2" viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4z"/><path d="m22 2-10 10"/></svg>
        </button>
      </div>
      <div class="powered-by">Powered by EIDON AI</div>
    `;
    document.body.appendChild(win);

    // State
    let isOpen = false;
    let isWaiting = false;
    const messages = document.getElementById('chat-messages');
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send');
    const notif = document.getElementById('chat-notif');

    // Toggle
    bubble.addEventListener('click', () => {
      isOpen = !isOpen;
      bubble.classList.toggle('open', isOpen);
      win.classList.toggle('open', isOpen);
      notif.style.display = 'none';
      if (isOpen) {
        input.focus();
        if (messages.children.length === 0) showWelcome();
      }
    });

    // Send
    async function send() {
      const text = input.value.trim();
      if (!text || isWaiting) return;

      addMessage(text, 'user');
      input.value = '';
      input.disabled = true;
      sendBtn.disabled = true;
      isWaiting = true;
      showTyping();

      const reply = await getAIResponse(text);

      hideTyping();
      addMessage(reply, 'bot');
      input.disabled = false;
      sendBtn.disabled = false;
      isWaiting = false;
      input.focus();
    }

    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });

    function addMessage(text, type) {
      // Convert markdown bold and newlines
      const html = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
      const div = document.createElement('div');
      div.className = 'chat-msg ' + type;
      div.innerHTML = html;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }

    function showTyping() {
      const div = document.createElement('div');
      div.className = 'typing-dots';
      div.id = 'typing-indicator';
      div.innerHTML = '<span></span><span></span><span></span>';
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }

    function hideTyping() {
      const t = document.getElementById('typing-indicator');
      if (t) t.remove();
    }

    function addQuickReplies(replies) {
      const wrap = document.createElement('div');
      wrap.className = 'quick-replies';
      replies.forEach(text => {
        const btn = document.createElement('button');
        btn.className = 'quick-reply';
        btn.textContent = text;
        btn.addEventListener('click', async () => {
          wrap.remove();
          addMessage(text, 'user');
          input.disabled = true;
          sendBtn.disabled = true;
          isWaiting = true;
          showTyping();
          const reply = await getAIResponse(text);
          hideTyping();
          addMessage(reply, 'bot');
          input.disabled = false;
          sendBtn.disabled = false;
          isWaiting = false;
        });
        wrap.appendChild(btn);
      });
      messages.appendChild(wrap);
      messages.scrollTop = messages.scrollHeight;
    }

    function showWelcome() {
      addMessage("Hey! 👋 I'm Adam, your EIDON Research assistant. I'm here 24/7 to help with products, shipping, peptide science, and more. What can I help you with?", 'bot');
      setTimeout(() => {
        addQuickReplies(['View Products', 'Shipping Info', 'Bundle Deals', 'Purity & Testing', 'What are peptides?']);
      }, 300);
    }

    // Show notification dot after 5 seconds
    setTimeout(() => {
      if (!isOpen) notif.style.display = 'block';
    }, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createChatWidget);
  } else {
    createChatWidget();
  }
})();
