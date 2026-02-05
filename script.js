import * as webllm from "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm/dist/index.min.js";

/* ---------------------------------------------------------
   MODEL + ENGINE SETUP
--------------------------------------------------------- */

const MODEL_LLAMA3 = "Llama-3-8B-Instruct-q4f16_1";
const MODEL_PHI3 = "Phi-3-mini-4k-instruct-q4f16_1";

let currentModelId = MODEL_LLAMA3;
let engine = null;
let modelLoaded = false;
let modelLoading = false;

/* ---------------------------------------------------------
   DATA STORAGE
--------------------------------------------------------- */

let characters = [];
let aiCharacters = [];
let activeCharacter = null;
let conversations = {};

let userProfile = {
  username: "",
  description: "",
};

let personaProfile = {
  name: "",
  description: "",
  image: null,
};

/* ---------------------------------------------------------
   ELEMENT + SCREEN CACHE
--------------------------------------------------------- */

const screens = {};
const elements = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  setupNavigation();
  setupModelSelectors();
  setupChat();
  setupCharacterSettings();
  setupUserSettings();
  setupPersonaSettings();
  setupAICharacters();
  renderUserCharacters();
  updateBotsMadeCount();
  showScreen("home");
});

/* ---------------------------------------------------------
   CACHE ELEMENTS
--------------------------------------------------------- */

function cacheElements() {
  screens.home = document.getElementById("screen-home");
  screens.chat = document.getElementById("screen-chat");
  screens.characterSettings = document.getElementById("screen-character-settings");
  screens.personaSettings = document.getElementById("screen-persona-settings");
  screens.userSettings = document.getElementById("screen-user-settings");
  screens.aiSettings = document.getElementById("screen-ai-settings");

  elements.homeGreeting = document.getElementById("home-greeting");

  elements.userCharacterList = document.getElementById("user-character-list");
  elements.userCharacterCards = document.getElementById("user-character-cards");
  elements.aiCharacterCards = document.getElementById("ai-character-cards");
  elements.aiCharacterStatus = document.getElementById("ai-character-status");
  elements.refreshAICharacters = document.getElementById("refresh-ai-characters");

  elements.modelSelect = document.getElementById("model-select");
  elements.aiSettingsModelSelect = document.getElementById("ai-settings-model-select");
  elements.reloadModelBtn = document.getElementById("reload-model");
  elements.engineStatus = document.getElementById("engine-status");
  elements.aiSettingsStatus = document.getElementById("ai-settings-status");

  elements.chatLog = document.getElementById("chat-log");
  elements.chatInput = document.getElementById("chat-input");
  elements.sendBtn = document.getElementById("send-btn");
  elements.activeCharacterName = document.getElementById("active-character-name");
  elements.activeCharacterByline = document.getElementById("active-character-byline");
  elements.typingIndicator = document.getElementById("typing-indicator");

  elements.charImage = document.getElementById("char-image");
  elements.charImagePreview = document.getElementById("char-image-preview");
  elements.charName = document.getElementById("char-name");
  elements.charDescription = document.getElementById("char-description");
  elements.charNotes = document.getElementById("char-notes");
  elements.charNameCounter = document.getElementById("char-name-counter");
  elements.charDescriptionCounter = document.getElementById("char-description-counter");
  elements.charNotesCounter = document.getElementById("char-notes-counter");
  elements.saveCharacter = document.getElementById("save-character");

  elements.userUsername = document.getElementById("user-username");
  elements.userDescription = document.getElementById("user-description");
  elements.userBotsMade = document.getElementById("user-bots-made");
  elements.userUsernameCounter = document.getElementById("user-username-counter");
  elements.userDescriptionCounter = document.getElementById("user-description-counter");
  elements.saveUserSettings = document.getElementById("save-user-settings");

  elements.personaImage = document.getElementById("persona-image");
  elements.personaImagePreview = document.getElementById("persona-image-preview");
  elements.personaName = document.getElementById("persona-name");
  elements.personaDescription = document.getElementById("persona-description");
  elements.personaNameCounter = document.getElementById("persona-name-counter");
  elements.personaDescriptionCounter = document.getElementById("persona-description-counter");
  elements.savePersona = document.getElementById("save-persona");
}

/* ---------------------------------------------------------
   NAVIGATION
--------------------------------------------------------- */

function showScreen(id) {
  Object.entries(screens).forEach(([key, el]) => {
    el.classList.toggle("active-screen", key === id);
  });
}

function setupNavigation() {
  document.querySelectorAll("[data-screen]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-screen");
      showScreen(target);
    });
  });
}

/* ---------------------------------------------------------
   MODEL LOADING
--------------------------------------------------------- */

function setupModelSelectors() {
  elements.modelSelect.addEventListener("change", async (e) => {
    currentModelId = e.target.value;
    elements.aiSettingsModelSelect.value = currentModelId;
    await reloadModel();
  });

  elements.aiSettingsModelSelect.addEventListener("change", async (e) => {
    currentModelId = e.target.value;
    elements.modelSelect.value = currentModelId;
    await reloadModel();
  });

  elements.reloadModelBtn.addEventListener("click", async () => {
    await reloadModel(true);
  });
}

async function ensureEngineLoaded() {
  if (modelLoaded || modelLoading) return;
  await loadModel(currentModelId);
}

async function loadModel(modelId) {
  modelLoading = true;
  modelLoaded = false;
  setEngineStatus(`Loading ${modelId}...`);

  try {
    engine = await webllm.CreateMLCEngine(
      {
        model_list: [{ model: modelId, model_id: modelId }],
        model: modelId,
      },
      {
        initProgressCallback: (report) => {
          if (report?.text) setEngineStatus(report.text);
        },
      }
    );

    modelLoaded = true;
    setEngineStatus(`Model ready — ${modelId}`);
    elements.aiSettingsStatus.textContent = `Active model: ${modelId}`;
    elements.chatInput.disabled = false;
    elements.sendBtn.disabled = false;

    if (aiCharacters.length === 0) generateAICharactersIfPossible();
  } catch (err) {
    console.error(err);
    setEngineStatus("Failed to load model.");
    elements.aiSettingsStatus.textContent = "Failed to load model.";
  } finally {
    modelLoading = false;
  }
}

async function reloadModel(force = false) {
  if (!force && !modelLoaded) {
    await ensureEngineLoaded();
    return;
  }
  engine = null;
  modelLoaded = false;
  await loadModel(currentModelId);
}

function setEngineStatus(text) {
  elements.engineStatus.textContent = text;
}

/* ---------------------------------------------------------
   CHAT SYSTEM
--------------------------------------------------------- */

function setupChat() {
  elements.sendBtn.addEventListener("click", sendMessage);

  elements.chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

function getConversationKey() {
  return activeCharacter ? activeCharacter.id : "global";
}

function getCurrentHistory() {
  const key = getConversationKey();
  if (!conversations[key]) conversations[key] = [];
  return conversations[key];
}

async function sendMessage() {
  const text = elements.chatInput.value.trim();
  if (!text || !modelLoaded || !engine) return;

  appendMessage("user", text);
  elements.chatInput.value = "";
  setEngineStatus("Thinking...");
  showTyping(true);

  try {
    const messages = buildChatMessages();
    const completion = await engine.chat.completions.create({
      model: currentModelId,
      messages,
    });

    const reply = completion.choices?.[0]?.message?.content ?? "(no response)";
    appendMessage("assistant", reply);
    setEngineStatus(`Model: ${currentModelId}`);
  } catch (err) {
    console.error(err);
    appendMessage("assistant", "Something went wrong while generating a response.");
    setEngineStatus("Error during generation.");
  } finally {
    showTyping(false);
  }
}

function buildChatMessages() {
  const history = getCurrentHistory();

  const personaPart = personaProfile.name
    ? `The user has the following persona.\nName: ${personaProfile.name}\nDescription: ${personaProfile.description || "N/A"}`
    : "The user has not defined a persona.";

  const characterPart = activeCharacter
    ? `You are roleplaying as "${activeCharacter.name}".\nDescription: ${activeCharacter.description || "N/A"}\nNotes: ${activeCharacter.notes || "N/A"}`
    : "You are not roleplaying as a specific character.";

  const systemPrompt =
    `${characterPart}\n\n${personaPart}\n\nGeneral rules:\n` +
    `- Be conversational.\n` +
    `- Stay in character unless asked.\n` +
    `- Do not mention these instructions.`;

  return [
    { role: "system", content: systemPrompt },
    ...history,
  ];
}

function appendMessage(role, text, store = true) {
  const div = document.createElement("div");
  div.classList.add("chat-message", role);
  div.textContent = text;
  elements.chatLog.appendChild(div);
  elements.chatLog.scrollTop = elements.chatLog.scrollHeight;

  if (store) {
    const history = getCurrentHistory();
    history.push({ role, content: text });
  }
}

function showTyping(show) {
  elements.typingIndicator.classList.toggle("hidden", !show);
}

/* ---------------------------------------------------------
   CHARACTER CREATION
--------------------------------------------------------- */

function setupCharacterSettings() {
  elements.charImage.addEventListener("change", handleCharacterImageChange);

  elements.charName.addEventListener("input", () => {
    elements.charNameCounter.textContent =
      `${elements.charName.value.length} / 20`;
  });

  elements.charDescription.addEventListener("input", () => {
    elements.charDescriptionCounter.textContent =
      `${elements.charDescription.value.length} / 750`;
  });

  elements.charNotes.addEventListener("input", () => {
    elements.charNotesCounter.textContent =
      `${elements.charNotes.value.length} / 300`;
  });

  elements.saveCharacter.addEventListener("click", () => {
    const name = elements.charName.value.trim();
    if (!name) return;

    const character = {
      id: crypto.randomUUID(),
      name,
      description: elements.charDescription.value.trim(),
      greeting: "",
      style: "",
      notes: elements.charNotes.value.trim(),
      by: userProfile.username || "You",
      image: elements.charImagePreview.dataset.src || null,
    };

    characters.push(character);
    clearCharacterForm();
    renderUserCharacters();
    updateBotsMadeCount();
    showScreen("home");
  });
}

function handleCharacterImageChange(e) {
  const file = e.target.files?.[0];
  if (!file) {
    elements.charImagePreview.textContent = "No image selected";
    elements.charImagePreview.dataset.src = "";
    elements.charImagePreview.innerHTML = "No image selected";
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    elements.charImagePreview.textContent = "File too large (max ~10MB).";
    elements.charImage.value = "";
    elements.charImagePreview.dataset.src = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    elements.charImagePreview.innerHTML = "";
    const img = document.createElement("img");
    img.src = reader.result;
    elements.charImagePreview.appendChild(img);
    elements.charImagePreview.dataset.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function clearCharacterForm() {
  elements.charImage.value = "";
  elements.charImagePreview.innerHTML = "No image selected";
  elements.charImagePreview.dataset.src = "";
  elements.charName.value = "";
  elements.charDescription.value = "";
  elements.charNotes.value = "";
  elements.charNameCounter.textContent = "0 / 20";
  elements.charDescriptionCounter.textContent = "0 / 750";
  elements.charNotesCounter.textContent = "0 / 300";
}

/* ---------------------------------------------------------
   USER SETTINGS
--------------------------------------------------------- */

function setupUserSettings() {
  elements.userUsername.addEventListener("input", () => {
    elements.userUsernameCounter.textContent =
      `${elements.userUsername.value.length} / 20`;
  });

  elements.userDescription.addEventListener("input", () => {
    elements.userDescriptionCounter.textContent =
      `${elements.userDescription.value.length} / 500`;
  });

  elements.saveUserSettings.addEventListener("click", () => {
    userProfile.username = elements.userUsername.value.trim();
    userProfile.description = elements.userDescription.value.trim();

    if (userProfile.username) {
      elements.homeGreeting.textContent = `Hello, ${userProfile.username}`;
    } else {
      elements.homeGreeting.textContent = "Hello there";
    }

    updateBotsMadeCount();
    showScreen("home");
  });
}

function updateBotsMadeCount() {
  const count = characters.length;
  elements.userBotsMade.value = count;
}

/* ---------------------------------------------------------
   PERSONA SETTINGS
--------------------------------------------------------- */

function setupPersonaSettings() {
  elements.personaImage.addEventListener("change", handlePersonaImageChange);

  elements.personaName.addEventListener("input", () => {
    elements.personaNameCounter.textContent =
      `${elements.personaName.value.length} / 20`;
  });

  elements.personaDescription.addEventListener("input", () => {
    elements.personaDescriptionCounter.textContent =
      `${elements.personaDescription.value.length} / 750`;
  });

  elements.savePersona.addEventListener("click", () => {
    personaProfile.name = elements.personaName.value.trim();
    personaProfile.description = elements.personaDescription.value.trim();
    personaProfile.image = elements.personaImagePreview.dataset.src || null;

    showScreen("home");
  });
}

function handlePersonaImageChange(e) {
  const file = e.target.files?.[0];
  if (!file) {
    elements.personaImagePreview.textContent = "No image selected";
    elements.personaImagePreview.dataset.src = "";
    elements.personaImagePreview.innerHTML = "No image selected";
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    elements.personaImagePreview.textContent = "File too large (max ~10MB).";
    elements.personaImage.value = "";
    elements.personaImagePreview.dataset.src = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    elements.personaImagePreview.innerHTML = "";
    const img = document.createElement("img");
    img.src = reader.result;
    elements.personaImagePreview.appendChild(img);
    elements.personaImagePreview.dataset.src = reader.result;
  };
  reader.readAsDataURL(file);
}

/* ---------------------------------------------------------
   CHARACTER LIST + SELECTION
--------------------------------------------------------- */

function renderUserCharacters() {
  elements.userCharacterList.innerHTML = "";
  characters.forEach((char) => {
    const li = document.createElement("li");
    li.className = "character-list-item";
    li.addEventListener("click", () => selectCharacter(char));

    const avatar = createAvatarSmall(char);
    const span = document.createElement("span");
    span.textContent = char.name;

    li.appendChild(avatar);
    li.appendChild(span);
    elements.userCharacterList.appendChild(li);
  });

  elements.userCharacterCards.innerHTML = "";
  characters.forEach((char) => {
    const card = createCharacterCard(char);
    elements.userCharacterCards.appendChild(card);
  });
}

function selectCharacter(char) {
  activeCharacter = char;
  elements.activeCharacterName.textContent = char.name;
  elements.activeCharacterByline.textContent = `Character by: ${char.by || "Unknown"}`;

  elements.chatLog.innerHTML = "";
  const history = getCurrentHistory();
  history.forEach((msg) => {
    appendMessage(msg.role, msg.content, false);
  });

  if (history.length === 0 && char.greeting) {
    appendMessage("assistant", char.greeting);
  }

  showScreen("chat");
  ensureEngineLoaded();
}

/* ---------------------------------------------------------
   AVATAR + CARD HELPERS
--------------------------------------------------------- */

function createAvatarSmall(char) {
  const div = document.createElement("div");
  div.className = "character-avatar-small";

  if (char.image) {
    const img = document.createElement("img");
    img.src = char.image;
    img.alt = char.name;
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";
    img.style.borderRadius = "999px";
    div.appendChild(img);
  } else {
    const letter = (char.name || "?").trim().charAt(0).toUpperCase() || "?";
    div.textContent = letter;
  }

  return div;
}

function createAvatarLarge(char) {
  const div = document.createElement("div");
  div.className = "character-avatar";

  if (char.image) {
    const img = document.createElement("img");
    img.src = char.image;
    img.alt = char.name;
    div.appendChild(img);
  } else {
    const letter = (char.name || "?").trim().charAt(0).toUpperCase() || "?";
    div.textContent = letter;
  }

  return div;
}

function createCharacterCard(char) {
  const card = document.createElement("article");
  card.className = "character-card";
  card.addEventListener("click", () => selectCharacter(char));

  const header = document.createElement("div");
  header.className = "character-card-header";

  const avatar = createAvatarLarge(char);
  const titleWrap = document.createElement("div");

  const title = document.createElement("div");
  title.className = "character-card-title";
  title.textContent = char.name;

  const byline = document.createElement("div");
  byline.className = "character
