const loginView = document.querySelector("#loginView");
const workspaceView = document.querySelector("#workspaceView");
const loginForm = document.querySelector("#loginForm");
const nameInput = document.querySelector("#nameInput");
const passphraseInput = document.querySelector("#passphraseInput");
const threadList = document.querySelector("#threadList");
const messages = document.querySelector("#messages");
const threadTitle = document.querySelector("#threadTitle");
const composer = document.querySelector("#composer");
const promptInput = document.querySelector("#promptInput");
const searchToggle = document.querySelector("#searchToggle");
const attachButton = document.querySelector("#attachButton");
const fileInput = document.querySelector("#fileInput");
const fileTray = document.querySelector("#fileTray");
const newThreadButton = document.querySelector("#newThreadButton");
const logoutButton = document.querySelector("#logoutButton");
const exportButton = document.querySelector("#exportButton");
const messageTemplate = document.querySelector("#messageTemplate");

const vaultKey = "adit-ai:vault";
const textTypes = ["text/", "application/json", "application/xml", "application/javascript"];

const state = {
  user: "",
  key: null,
  salt: null,
  threads: [],
  activeThreadId: null,
  attachments: [],
};

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const user = nameInput.value.trim() || "Adit";
  const passphrase = passphraseInput.value;
  try {
    await unlockVault(user, passphrase);
    loginView.classList.add("hidden");
    workspaceView.classList.remove("hidden");
    ensureThread();
    render();
  } catch {
    passphraseInput.setCustomValidity("That passphrase could not unlock this vault.");
    passphraseInput.reportValidity();
    setTimeout(() => passphraseInput.setCustomValidity(""), 800);
  }
});

newThreadButton.addEventListener("click", () => {
  createThread();
  persistVault();
  render();
});

logoutButton.addEventListener("click", () => {
  state.key = null;
  state.threads = [];
  state.activeThreadId = null;
  passphraseInput.value = "";
  workspaceView.classList.add("hidden");
  loginView.classList.remove("hidden");
});

exportButton.addEventListener("click", () => {
  const vault = localStorage.getItem(vaultKey) || "{}";
  const blob = new Blob([vault], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "adit-ai-encrypted-vault.json";
  link.click();
  URL.revokeObjectURL(url);
});

attachButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async () => {
  const files = [...fileInput.files].slice(0, 6);
  const loaded = await Promise.all(files.map(readAttachment));
  state.attachments.push(...loaded);
  fileInput.value = "";
  renderFiles();
});

composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  const prompt = promptInput.value.trim();
  if (!prompt) return;
  const thread = activeThread();
  const userMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: prompt,
    attachments: state.attachments,
    createdAt: Date.now(),
  };
  thread.messages.push(userMessage);
  thread.title = makeTitle(prompt);
  promptInput.value = "";
  state.attachments = [];
  render();
  await persistVault();
  await answer(thread, userMessage);
});

promptInput.addEventListener("input", () => {
  promptInput.style.height = "auto";
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 180)}px`;
});

async function unlockVault(user, passphrase) {
  const existing = JSON.parse(localStorage.getItem(vaultKey) || "null");
  state.user = user;
  state.salt = existing?.salt ? fromBase64(existing.salt) : crypto.getRandomValues(new Uint8Array(16));
  state.key = await deriveKey(passphrase, state.salt);

  if (existing?.payload) {
    const vault = await decrypt(existing.payload, state.key);
    state.threads = vault.threads || [];
  } else {
    state.threads = [];
    await persistVault();
  }
}

async function persistVault() {
  if (!state.key) return;
  const payload = await encrypt({ threads: state.threads, updatedAt: Date.now() }, state.key);
  localStorage.setItem(vaultKey, JSON.stringify({ version: 1, salt: toBase64(state.salt), payload }));
}

async function deriveKey(passphrase, salt) {
  const baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 180000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encrypt(data, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return { iv: toBase64(iv), data: toBase64(new Uint8Array(cipher)) };
}

async function decrypt(payload, key) {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(payload.iv) },
    key,
    fromBase64(payload.data),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

function ensureThread() {
  if (!state.threads.length) createThread();
  state.activeThreadId = state.activeThreadId || state.threads[0].id;
}

function createThread() {
  const thread = {
    id: crypto.randomUUID(),
    title: "Untitled Research",
    messages: [],
    createdAt: Date.now(),
  };
  state.threads.unshift(thread);
  state.activeThreadId = thread.id;
}

function activeThread() {
  return state.threads.find((thread) => thread.id === state.activeThreadId) || state.threads[0];
}

function render() {
  renderThreads();
  renderMessages();
  renderFiles();
}

function renderThreads() {
  threadList.innerHTML = "";
  for (const thread of state.threads) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `thread-button${thread.id === state.activeThreadId ? " active" : ""}`;
    button.innerHTML = `${escapeHtml(thread.title)}<span>${thread.messages.length} messages</span>`;
    button.addEventListener("click", () => {
      state.activeThreadId = thread.id;
      render();
    });
    threadList.append(button);
  }
}

function renderMessages() {
  const thread = activeThread();
  threadTitle.textContent = thread?.title || "Untitled Research";
  messages.innerHTML = "";

  if (!thread?.messages.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `
      <p class="eyebrow">Ask with context</p>
      <h3>Research like a search engine, think like an analyst.</h3>
      <div class="suggestions">
        <button type="button">Compare three sources on a market trend</button>
        <button type="button">Summarize this file and list risks</button>
        <button type="button">Find current evidence for a claim</button>
      </div>
    `;
    empty.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        promptInput.value = button.textContent;
        promptInput.focus();
      });
    });
    messages.append(empty);
    return;
  }

  for (const message of thread.messages) {
    const node = messageTemplate.content.firstElementChild.cloneNode(true);
    node.classList.add(message.role);
    node.querySelector(".message-meta").textContent = message.role === "user" ? state.user : "Adit AI";
    node.querySelector(".message-body").textContent = message.content;
    const sources = node.querySelector(".source-list");
    if (message.attachments?.length) {
      for (const file of message.attachments) sources.append(fileChip(file.name));
    }
    if (message.sources?.length) {
      for (const source of message.sources) {
        const link = document.createElement("a");
        link.href = source.url;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = source.title || new URL(source.url).hostname;
        sources.append(link);
      }
    }
    messages.append(node);
  }
  messages.scrollTop = messages.scrollHeight;
}

function renderFiles() {
  fileTray.innerHTML = "";
  for (const file of state.attachments) fileTray.append(fileChip(file.name));
}

function fileChip(name) {
  const chip = document.createElement("span");
  chip.className = "file-chip";
  chip.textContent = name;
  return chip;
}

async function answer(thread, userMessage) {
  const pending = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: "Searching, reading, and synthesizing...",
    sources: [],
    createdAt: Date.now(),
  };
  thread.messages.push(pending);
  renderMessages();

  try {
    const history = thread.messages
      .filter((message) => message.role !== "assistant" || message.id !== pending.id)
      .slice(-8)
      .map((message) => ({ role: message.role, content: message.content }));

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: userMessage.content,
        history,
        attachments: userMessage.attachments,
        search: searchToggle.checked,
      }),
    });

    const data = await response.json();
    pending.content = data.answer || "I could not produce an answer this time.";
    pending.sources = data.sources || [];
  } catch {
    pending.content =
      "Adit AI could not reach the research endpoint. The encrypted vault still saved your message locally.";
  }

  await persistVault();
  render();
}

async function readAttachment(file) {
  const isText = textTypes.some((type) => file.type.startsWith(type)) || /\.(txt|md|csv|json|xml|js|ts|css|html)$/i.test(file.name);
  const text = isText ? await file.text() : "";
  return {
    id: crypto.randomUUID(),
    name: file.name,
    type: file.type || "unknown",
    size: file.size,
    text: text.slice(0, 24000),
    truncated: text.length > 24000,
  };
}

function makeTitle(text) {
  return text.replace(/\s+/g, " ").slice(0, 64) || "Untitled Research";
}

function toBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}
