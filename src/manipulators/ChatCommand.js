/**
 * ./src/manipulators/ChatCommand.js
 *
 * Manipulator that accepts chat messages to convert to controller state.
 */
import { BaseManipulator } from './BaseManipulator.js';

// Initialize global configuration store if it doesn't exist
if (!window.chatConfigs) {
	window.chatConfigs = {
		configs: new Map(),
		listeners: new Set(),

		saveConfig(name, config) {
			this.configs.set(name, config);
			localStorage.setItem(`chatConfig_${name}`, JSON.stringify(config));
			this.notifyListeners(name, config);
		},

		loadConfig(name) {
			if (this.configs.has(name)) {
				return this.configs.get(name);
			}
			const saved = localStorage.getItem(`chatConfig_${name}`);
			return saved ? JSON.parse(saved) : null;
		},

		deleteConfig(name) {
			this.configs.delete(name);
			localStorage.removeItem(`chatConfig_${name}`);
			this.notifyListeners(name, null);
		},

		listConfigs() {
			return Array.from(this.configs.keys());
		},

		addListener(callback) {
			this.listeners.add(callback);
		},

		removeListener(callback) {
			this.listeners.delete(callback);
		},

		notifyListeners(name, config) {
			this.listeners.forEach(callback => callback(name, config));
		}
	};
}

/**
 * @typedef {Object} chatParams
 * @property {string} [channel=''] - Twitch channel name to connect to
 * @property {number} [maxMessages=50] - Maximum messages to display
 */

export class ChatCommand extends BaseManipulator {
	static get defaultConfig() {
		return {
			channel: '',
			maxMessages: 50,
			configName: '',
			processInOrder: false
		};
	}
	static get displayName() {
		return "Chat Command";
	}

	static get description() {
		return "Accept text commands to control controller state.";
	}

	/**
	 * @param {chatParams} params - Configuration parameters
	 */
	constructor(params = {}) {
		super(params);

		this.channel = params.channel || '';
		this.maxMessages = params.maxMessages || 50;
		this.configName = params.configName || 'default';
		this.processInOrder = params.processInOrder || false;
		this.maxDuration = 2000; // maximum duration that a command can run for

		// WebSocket connection
		this.ws = null;
		this.connected = false;
		this.reconnectTimeout = null;
		this.pingInterval = null;
		this.manualDisconnect = false; // Track if disconnect was manual

		// Message buffer - now only stores messages with keywords
		this.messages = [];
		this.displayedMessages = new Map(); // messageId -> { element, expireTime }
		this.messageIdCounter = 0;

		// Command processing
		this.commandQueue = [];
		this.activeConfig = null;
		this.userCooldowns = new Map(); // username -> { command: lastUsedTime }
		this.commandCooldowns = new Map(); // command -> lastUsedTime
		this.currentCommandStates = []; // Array of controller states for current command
		this.currentCommandIndex = 0;
		this.currentCommandStartTime = 0;
		this.frameCounter = 0; // Count frames at 50ms intervals

		// UI elements
		this._channelInput = null;
		this._connectButton = null;
		this._statusIndicator = null;
		this._messageContainer = null;
		this._clearButton = null;
		this._configSelect = null;
		this._configureButton = null;
		this._processOrderCheckbox = null;
		this._queueSizeDisplay = null;

		// Listen for config changes
		this._configChangeHandler = (name) => {
			if (name === this.configName) {
				this.loadConfiguration(name);
			}
			this._updateConfigSelect();
		};
		window.chatConfigs.addListener(this._configChangeHandler);

		// Load initial config if specified
		if (this.configName) {
			this.loadConfiguration(this.configName);
		}

		// Register chat-specific actions
		this._registerChatActions();

		// Start message expiration timer
		this._startExpirationTimer();

		// Auto-connect if channel name provided
		if (this.channel) this.connect(this.channel);
	}

	/**
	 * Start timer to remove expired messages
	 */
	_startExpirationTimer() {
		setInterval(() => {
			this._removeExpiredMessages();
		}, 100); // Check every 100ms for expired messages
	}

	/**
	 * Remove expired messages from display
	 */
	_removeExpiredMessages() {
		const now = Date.now();
		const expiredIds = [];

		for (const [messageId, messageData] of this.displayedMessages) {
			if (now >= messageData.expireTime) {
				// Remove from DOM
				if (messageData.element && messageData.element.parentNode) {
					messageData.element.parentNode.removeChild(messageData.element);
				}
				expiredIds.push(messageId);
			}
		}

		// Clean up expired entries
		expiredIds.forEach(id => this.displayedMessages.delete(id));
	}

	/**
	 * Register actions specific to the ChatCommand manipulator
	 */
	_registerChatActions() {
		this.registerAction({
			name: 'connect',
			displayName: 'Connect',
			description: 'Connect to a Twitch channel',
			parameters: [
				{
					name: 'channel',
					type: 'string',
					description: 'Channel name (without #)',
					required: true
				}
			],
			handler: (params) => this.connect(params.channel)
		});

		this.registerAction({
			name: 'setInOrder',
			displayName: 'Set in-order processing',
			description: 'Controls whether messages are handled in order or randomly',
			handler: (params) => { this.processInOrder = params.enabled; }
		});

		this.registerAction({
			name: 'disconnect',
			displayName: 'Disconnect',
			description: 'Disconnect from Twitch chat',
			handler: () => this.disconnect()
		});

		this.registerAction({
			name: 'clearMessages',
			displayName: 'Clear Messages',
			description: 'Clear all displayed messages',
			handler: () => this.clearMessages()
		});

		this.registerAction({
			name: 'setMaxMessages',
			displayName: 'Set Max Messages',
			description: 'Set maximum number of messages to display',
			parameters: [
				{
					name: 'max',
					type: 'number',
					description: 'Maximum messages (1-200)',
					required: true,
					default: 50
				}
			],
			handler: (params) => this.setMaxMessages(params.max)
		});

		this.registerAction({
			name: 'getMessageCount',
			displayName: 'Get Message Count',
			description: 'Get the current number of messages',
			handler: () => this.messages.length
		});

		this.registerAction({
			name: 'insertMessage',
			displayName: 'Insert Message',
			description: 'Insert a message into the chat system',
			handler: (params) => this._processMessage("bot", params.message),
		});
	}

	/**
	 * Load a command configuration
	 * @param {string} configName
	 */
	loadConfiguration(configName) {
		if (!configName) {
			this.activeConfig = null;
			this.configName = '';
			this.log('Configuration cleared');
			return false;
		}

		const config = window.chatConfigs.loadConfig(configName);
		if (config) {
			this.activeConfig = config;
			this.configName = configName;

			// Update UI
			if (this._configSelect) {
				this._configSelect.value = configName;
			}

			this.log(`Loaded configuration: ${configName}`);
			return true;
		} else {
			this.log(`Configuration not found: ${configName}`);
			return false;
		}
	}

	/**
	 * Connect to a Twitch channel
	 * @param {string} channel - Channel name (without #)
	 */
	connect(channel) {
		if (!channel) {
			this.log('Channel name is required');
			return false;
		}

		// Disconnect if already connected
		if (this.ws) {
			this.disconnect();
		}

		this.channel = channel.toLowerCase().replace('#', '');
		this.manualDisconnect = false; // Reset manual disconnect flag
		this.log(`Connecting to channel: ${this.channel}`);

		try {
			// Connect to Twitch IRC via WebSocket
			this.ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

			this.ws.onopen = () => {
				this.log('WebSocket connected');
				// Authenticate as anonymous user
				this.ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
				this.ws.send('PASS SCHMOOPIIE');
				this.ws.send(`NICK justinfan${Math.floor(Math.random() * 100000)}`);
				this.ws.send(`JOIN #${this.channel}`);

				this.connected = true;
				this._updateConnectionStatus();

				// Start ping interval to keep connection alive
				this.pingInterval = setInterval(() => {
					if (this.ws && this.ws.readyState === WebSocket.OPEN) {
						this.ws.send('PING :tmi.twitch.tv');
					}
				}, 60000); // Ping every minute
			};

			this.ws.onmessage = (event) => {
				this._handleMessage(event.data);
			};

			this.ws.onerror = (error) => {
				this.log(`WebSocket error: ${error}`);
				this._updateConnectionStatus();
			};

			this.ws.onclose = () => {
				this.log('WebSocket disconnected');
				this.connected = false;
				this._updateConnectionStatus();

				// Clear ping interval
				if (this.pingInterval) {
					clearInterval(this.pingInterval);
					this.pingInterval = null;
				}

				// Auto-reconnect only if we didn't manually disconnect and manipulator is enabled
				if (this.channel && this.enabled && !this.manualDisconnect) {
					this.reconnectTimeout = setTimeout(() => {
						this.log('Attempting to reconnect...');
						this.connect(this.channel);
					}, 5000);
				}
			};

			// Update UI
			if (this._channelInput) {
				this._channelInput.value = this.channel;
			}

			return true;
		} catch (error) {
			this.log(`Failed to connect: ${error.message}`);
			return false;
		}
	}

	/**
	 * Disconnect from Twitch chat
	 */
	disconnect() {
		this.log('Disconnecting from Twitch chat');

		// Set manual disconnect flag to prevent auto-reconnect
		this.manualDisconnect = true;

		// Clear reconnect timeout
		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout);
			this.reconnectTimeout = null;
		}

		// Clear ping interval
		if (this.pingInterval) {
			clearInterval(this.pingInterval);
			this.pingInterval = null;
		}

		// Close WebSocket
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}

		this.connected = false;
		this._updateConnectionStatus();

		return true;
	}

	/**
	 * Clear all messages
	 */
	clearMessages() {
		this.messages = [];

		// Clear displayed messages
		for (const [messageId, messageData] of this.displayedMessages) {
			if (messageData.element && messageData.element.parentNode) {
				messageData.element.parentNode.removeChild(messageData.element);
			}
		}
		this.displayedMessages.clear();

		if (this._messageContainer) {
			this._messageContainer.innerHTML = '';
		}
		this.log('Messages cleared');
		return true;
	}

	/**
	 * Set maximum number of messages to display
	 * @param {number} max
	 */
	setMaxMessages(max) {
		this.maxMessages = Math.max(1, Math.min(200, max));
		// Trim existing messages if needed
		while (this.messages.length > this.maxMessages) {
			this.messages.shift();
		}
		this.log(`Max messages set to ${this.maxMessages}`);
		return this.maxMessages;
	}

	/**
	 * Handle incoming IRC messages
	 * @param {string} rawMessage
	 */
	_handleMessage(rawMessage) {
		const lines = rawMessage.split('\r\n');

		for (const line of lines) {
			if (!line) continue;

			// Handle PING
			if (line.startsWith('PING')) {
				this.ws.send('PONG :tmi.twitch.tv');
				continue;
			}

			// Parse PRIVMSG (chat messages)
			if (line.includes('PRIVMSG')) {
				const match = line.match(/ :([^!]+)!.*PRIVMSG #\w+ :(.+)/);
				if (match) {
					const [, username, message] = match;
					this._processMessage(username, message);
				}
			}

			// Handle JOIN confirmation
			if (line.includes('JOIN') && line.includes(this.channel)) {
				this.log(`Successfully joined #${this.channel}`);
			}
		}
	}

	/**
	 * Process a message - only display and store if it contains keywords
	 * @param {string} username
	 * @param {string} message
	 */
	_processMessage(username, message) {
		// Only process if we have an active config
		if (!this.activeConfig) {
			return;
		}
		const foundKeywords = [];
		const messageLower = message.toLowerCase();

		// Check each command for matching keywords
		for (const command of this.activeConfig.commands) {
			for (const keyword of command.keywords) {
				const keywordRegex = new RegExp(`\\b${keyword.toLowerCase()}\\b`, 'i');
				if (keywordRegex.test(messageLower)) {
					foundKeywords.push(keyword);
					break; // Only need one keyword match per command
				}
			}
		}
		
		// Only process messages that contain keywords
		if (foundKeywords.length > 0) {
			const messageData = {
				id: ++this.messageIdCounter,
				username,
				message,
				keywords: foundKeywords,
				timestamp: Date.now(),
				handled: false
			};

			this.messages.push(messageData);

			// Trim old messages
			while (this.messages.length > this.maxMessages) {
				this.messages.shift();
			}

			// Add to display
			this._addMessageToDisplay(messageData);

			// Add to command queue
			this.commandQueue.push({
				id: messageData.id,
				username,
				keywords: foundKeywords,
				timestamp: Date.now()
			});

			this._updateQueueDisplay();
		}
	}

	/**
	 * Add a message to the visual display
	 * @param {Object} messageData
	 */
	_addMessageToDisplay(messageData) {
		if (!this._messageContainer) return;

		const messageEl = document.createElement('div');
		messageEl.className = 'chat-message';
		messageEl.dataset.messageId = messageData.id;

		const usernameEl = document.createElement('span');
		usernameEl.className = 'chat-username';
		usernameEl.textContent = messageData.username;

		const keywordsEl = document.createElement('span');
		keywordsEl.className = 'chat-keywords';
		keywordsEl.textContent = ': ' + messageData.keywords.join(', ');

		messageEl.appendChild(usernameEl);
		messageEl.appendChild(keywordsEl);

		this._messageContainer.appendChild(messageEl);

		// Auto-scroll to bottom
		this._messageContainer.scrollTop = this._messageContainer.scrollHeight;

		// Set expiration time (3 seconds from now)
		const expireTime = Date.now() + 3000;

		// Store for expiration tracking
		this.displayedMessages.set(messageData.id, {
			element: messageEl,
			expireTime: expireTime
		});
	}

	/**
	 * Highlight a message as handled
	 * @param {number} messageId
	 */
	_highlightMessage(messageId) {
		const messageData = this.displayedMessages.get(messageId);
		if (messageData && messageData.element) {
			messageData.element.classList.add('handled');
		}

		// Also mark in messages array
		const message = this.messages.find(msg => msg.id === messageId);
		if (message) {
			message.handled = true;
		}
	}

	/**
	 * Update the queue size display
	 */
	_updateQueueDisplay() {
		if (this._queueSizeDisplay) {
			this._queueSizeDisplay.textContent = `Queue: ${this.commandQueue.length}`;
		}
	}

	/**
	 * Update connection status indicator
	 */
	_updateConnectionStatus() {
		if (this._statusIndicator) {
			this._statusIndicator.textContent = this.connected ? '● Connected' : '○ Disconnected';
			this._statusIndicator.className = 'twitch-status ' + (this.connected ? 'connected' : 'disconnected');
		}

		if (this._connectButton) {
			this._connectButton.textContent = this.connected ? 'Disconnect' : 'Connect';
		}
	}

	_processInternal(state, deltaTime) {
		const now = Date.now();

		// Check if we need to start a new command
		if (this.currentCommandStates.length === 0 ||
			this.currentCommandIndex >= this.currentCommandStates.length) {

			// Keep at most 60 entries
			if (this.commandQueue.length > 60)
				this.commandQueue = this.commandQueue.slice(-60);
			// Clean up old entries (older than 3 seconds)
			this.commandQueue = this.commandQueue.filter(
				entry => now - entry.timestamp < 3000
			);

			// Get next command from queue
			if (this.commandQueue.length > 0) {
				const entry = this._selectFromQueue();
				if (entry) {
					this._startCommand(entry, now);
				}
			}

			this._updateQueueDisplay();
		}

		// Apply current command state if we have one
		if (this.currentCommandStates.length > 0 &&
			this.currentCommandIndex < this.currentCommandStates.length) {

			// Merge command state with incoming state
			const commandState = this.currentCommandStates[this.currentCommandIndex];
			state = this._mergeStates(state, commandState);

			// Advance to next frame every 50ms
			this.frameCounter += deltaTime;
			if (this.frameCounter >= 50) {
				this.frameCounter -= 50;
				this.currentCommandIndex++;
			}
		}

		return state;
	}

	/**
	 * Select an entry from the queue
	 * @returns {Object|null} Queue entry or null
	 */
	_selectFromQueue() {
		if (this.commandQueue.length === 0) return null;

		let entry;
		if (this.processInOrder) {
			// Take first entry
			entry = this.commandQueue.shift();
		} else {
			// Random selection
			const index = Math.floor(Math.random() * this.commandQueue.length);
			entry = this.commandQueue.splice(index, 1)[0];
		}

		// Highlight the selected message
		if (entry && entry.id) {
			this._highlightMessage(entry.id);
		}

		return entry;
	}

	/**
	 * Start processing a command
	 * @param {Object} entry - Queue entry with username, keywords, timestamp
	 * @param {number} now - Current time
	 */
	_startCommand(entry, now) {
		if (!this.activeConfig) return;

		// Find all matching commands
		const matchingCommands = [];
		for (const keyword of entry.keywords) {
			for (const command of this.activeConfig.commands) {
				if (command.keywords.includes(keyword)) {
					// Check cooldowns
					if (this._checkCooldowns(command, entry.username, now)) {
						matchingCommands.push(command);
					}
					break; // Only add each command once
				}
			}
		}

		if (matchingCommands.length === 0) return;

		// Check for exclusive commands
		const exclusiveCommand = matchingCommands.find(cmd => cmd.exclusive);
		const commandsToProcess = exclusiveCommand ? [exclusiveCommand] : matchingCommands;

		// Calculate initial command duration based on queue fill.
		// Assume that the goal is to stretch the remaining commands
		// over 80% of the max duration, but give each one at least 50 ms.
		let desiredDuration = Math.max((this.maxDuration * 0.8) / this.commandQueue.length, 50);

		// Check if any commands require a longer time.
		for (const command of commandsToProcess) {
			desiredDuration = Math.max(desiredDuration, command.minDuration);
		}

		// Cap at max duration.
		desiredDuration = Math.min(desiredDuration, this.maxDuration);

		// Initialize state array (one state per 50ms frame)
		const frameCount = Math.ceil(desiredDuration / 50);
		this.currentCommandStates = [];
		for (let i = 0; i < frameCount; i++) {
			this.currentCommandStates.push({
				digital: {},
				analog: {}
			});
		}

		// Apply each command to the state array
		for (const command of commandsToProcess) {
			// Check probability
			if (Math.random() > command.probability) continue;

			// Update cooldowns
			this._updateCooldowns(command, entry.username, now);

			// Apply actions to state array
			this._applyCommandToStates(command);
		}

		// Reset playback
		this.currentCommandIndex = 0;
		this.currentCommandStartTime = now;
		this.frameCounter = 0;
	}

	/**
	 * Check if a command can be used (cooldowns)
	 * @param {Object} command
	 * @param {string} username
	 * @param {number} now
	 * @returns {boolean}
	 */
	_checkCooldowns(command, username, now) {
		// Check global cooldown for this command
		const commandKey = command.keywords[0]; // Use first keyword as key
		const lastUsed = this.commandCooldowns.get(commandKey) || 0;
		if (now - lastUsed < command.cooldown) {
			return false;
		}

		// Check user cooldown
		const userCooldowns = this.userCooldowns.get(username) || {};
		const userLastUsed = userCooldowns[commandKey] || 0;
		if (now - userLastUsed < command.userCooldown) {
			return false;
		}

		return true;
	}

	/**
	 * Update cooldowns after using a command
	 * @param {Object} command
	 * @param {string} username
	 * @param {number} now
	 */
	_updateCooldowns(command, username, now) {
		const commandKey = command.keywords[0];

		// Update global cooldown
		this.commandCooldowns.set(commandKey, now);

		// Update user cooldown
		const userCooldowns = this.userCooldowns.get(username) || {};
		userCooldowns[commandKey] = now;
		this.userCooldowns.set(username, userCooldowns);
	}

	/**
	 * Apply a command's actions to the state array
	 * @param {Object} command
	 */
	_applyCommandToStates(command) {
		// Respect the command's maximum time, otherwise fill the buffer.
		const maxFrameCount = Math.min(Math.ceil(command.maxDuration / 50), this.currentCommandStates.length);
		// Apply each action for its duration. If all actions are consumed, loop.
		let currentFrame = 0;
		while (currentFrame < maxFrameCount) {
			for (const action of command.actions) {
				// How many frames this action gets applied to
				const actionFrameCount = Math.ceil(action.duration / 50);

				// Apply to frames
				for (let i = 0; (i < actionFrameCount) && (currentFrame < maxFrameCount); i++) {
					const stateFrame = this.currentCommandStates[currentFrame];

					// Merge digital states (OR)
					if (action.digital) {
						for (const [button, value] of Object.entries(action.digital)) {
							if (value) {
								stateFrame.digital[button] = true;
							}
						}
					}

					// Merge analog states (most extreme)
					if (action.analog) {
						for (const [stick, value] of Object.entries(action.analog)) {
							if (!stateFrame.analog[stick] ||
								Math.abs(value) > Math.abs(stateFrame.analog[stick])) {
								stateFrame.analog[stick] = value;
							}
						}
					}

					currentFrame++;
				}
			}
		}
	}

	/**
	 * Merge command state into controller state
	 * @param {Object} controllerState
	 * @param {Object} commandState
	 * @returns {Object} Merged state
	 */
	_mergeStates(controllerState, commandState) {
		// OR digital states
		for (const [button, value] of Object.entries(commandState.digital)) {
			if (value) {
				controllerState.digital[button] = true;
			}
		}

		// Use most extreme analog values
		for (const [stick, value] of Object.entries(commandState.analog)) {
			// Map to controller state names
			let controllerKey;
			switch (stick) {
				case 'stickLX': controllerKey = 'leftX'; break;
				case 'stickLY': controllerKey = 'leftY'; break;
				case 'stickRX': controllerKey = 'rightX'; break;
				case 'stickRY': controllerKey = 'rightY'; break;
				default: continue;
			}

			if (!controllerState.analog[controllerKey] ||
				Math.abs(value) > Math.abs(controllerState.analog[controllerKey])) {
				controllerState.analog[controllerKey] = value;
			}
		}

		return controllerState;
	}

	createControls() {
		const container = document.createElement('div');
		container.className = 'manipulator-controls chatcommand-custom';

		// Connection controls
		const connectionDiv = document.createElement('div');
		connectionDiv.className = 'manipulator-control-group inline-with-gap';

		const channelLabel = document.createElement('label');
		channelLabel.textContent = 'Twitch Channel: ';

		this._channelInput = document.createElement('input');
		this._channelInput.type = 'text';
		this._channelInput.placeholder = 'leave blank for bot';
		this._channelInput.value = this.channel;
		this._channelInput.className = 'chatcommand-channel-input';

		this._connectButton = document.createElement('button');
		this._connectButton.textContent = 'Connect';
		this._connectButton.className = 'button';
		this._connectButton.addEventListener('click', () => {
			if (this.connected) {
				this.executeAction('disconnect');
			} else {
				const channel = this._channelInput.value.trim();
				if (channel) {
					this.executeAction('connect', { channel });
				}
			}
		});

		this._statusIndicator = document.createElement('span');
		this._statusIndicator.className = 'twitch-status disconnected';
		this._statusIndicator.textContent = '○ Disconnected';

		const buttongrouper = document.createElement('div');
		buttongrouper.className = 'inline-with-gap';

		const editlink = document.createElement('button');
		editlink.textContent = 'Edit Commands';
		editlink.className = 'button secondary';
		editlink.addEventListener('click', () => {
			const url = './command-edit.html';
			window.open(url, "_blank");
		});

		const reload = document.createElement('button');
		reload.textContent = 'Reload Commands';
		reload.className = 'button secondary';
		reload.addEventListener('click', () => {
			this.loadConfiguration(this.configName);
		});

		buttongrouper.appendChild(editlink);
		buttongrouper.appendChild(reload);

		connectionDiv.appendChild(channelLabel);
		connectionDiv.appendChild(this._channelInput);
		connectionDiv.appendChild(this._connectButton);
		connectionDiv.appendChild(this._statusIndicator);
		connectionDiv.appendChild(buttongrouper);

		// Queue status
		const queueDiv = document.createElement('div');
		queueDiv.className = 'manipulator-control-group';

		this._queueSizeDisplay = document.createElement('span');
		this._queueSizeDisplay.className = 'chat-queue-display';
		this._queueSizeDisplay.textContent = 'Queue: 0';

		queueDiv.appendChild(this._queueSizeDisplay);

		// Message display
		const messageDiv = document.createElement('div');
		messageDiv.className = 'manipulator-control-group';

		const messageHeader = document.createElement('div');
		messageHeader.className = 'chat-message-header';

		const messageTitle = document.createElement('span');
		messageTitle.textContent = 'Command Messages';

		this._clearButton = document.createElement('button');
		this._clearButton.textContent = 'Clear';
		this._clearButton.className = 'button small';
		this._clearButton.addEventListener('click', () => {
			this.executeAction('clearMessages');
		});

		const inOrderLabel = document.createElement('label');
		this._inOrderCheckbox = document.createElement('input');
		this._inOrderCheckbox.type = 'checkbox';
		this._inOrderCheckbox.checked = this.processInOrder;
		this._inOrderCheckbox.addEventListener('change', () => {
			this.executeAction('setInOrder', { enabled: this._inOrderCheckbox.checked });
		});
		inOrderLabel.appendChild(this._inOrderCheckbox);
		inOrderLabel.appendChild(document.createTextNode('Process in order'));

		messageHeader.appendChild(messageTitle);
		messageHeader.appendChild(inOrderLabel);
		messageHeader.appendChild(this._clearButton);

		this._messageContainer = document.createElement('div');
		this._messageContainer.className = 'chat-messages';

		messageDiv.appendChild(messageHeader);
		messageDiv.appendChild(this._messageContainer);

		// Assemble UI
		container.appendChild(connectionDiv);
		container.appendChild(queueDiv);
		container.appendChild(messageDiv);

		// Add custom styles
		const style = document.createElement('style');
		style.textContent = `
			.twitch-channel-input {
				flex: 1;
				margin: 0 10px;
				padding: 5px;
			}
			.twitch-status {
				margin-left: 10px;
				font-weight: bold;
			}
			.twitch-status.connected {
				color: #00ff00;
			}
			.twitch-status.disconnected {
				color: #ff0000;
			}
			.chat-queue-display {
				font-weight: bold;
				color: #b584ffff;
				padding: 5px;
				background: rgba(145, 70, 255, 0.1);
				border-radius: 4px;
			}
			.chat-message-header {
				display: flex;
				justify-content: space-between;
				align-items: center;
				margin-bottom: 10px;
			}
			.chat-messages {
				height: 200px;
				overflow-y: auto;
				border: 1px solid #444;
				border-radius: 4px;
				padding: 10px;
				background: #1a1a1a;
				font-family: monospace;
				font-size: 12px;
			}
			.chat-message {
				margin-bottom: 5px;
				word-wrap: break-word;
				padding: 3px 6px;
				border-radius: 3px;
				background: rgba(255, 255, 255, 0.05);
				border-left: 3px solid #9146ff;
				transition: all 0.3s ease;
			}
			.chat-message.handled {
				background: rgba(0, 255, 0, 0.2);
				border-left-color: #00ff00;
				animation: highlight 0.5s ease-out;
			}
			@keyframes highlight {
				0% {
					background: rgba(0, 255, 0, 0.5);
					transform: scale(1.02);
				}
				100% {
					background: rgba(0, 255, 0, 0.2);
					transform: scale(1);
				}
			}
			.twitch-username {
				color: #9146ff;
				font-weight: bold;
			}
			.chat-keywords {
				color: #00ff88;
				font-weight: bold;
			}
			.chat-info {
				color: #888;
				font-style: italic;
				margin: 0;
			}
		`;
		container.appendChild(style);

		return container;
	}

	_getSpecificConfig() {
		return {
			channel: this.channel,
			maxMessages: this.maxMessages,
			configName: this.configName,
			processInOrder: this.processInOrder
		};
	}

	_setSpecificConfig(config) {
		if (config.channel !== undefined) {
			this.channel = config.channel;
			if (this._channelInput) {
				this._channelInput.value = this.channel;
			}
		}

		if (config.maxMessages !== undefined) {
			this.setMaxMessages(config.maxMessages);
		}

		if (config.configName !== undefined) {
			this.loadConfiguration(config.configName);
		}

		if (config.processInOrder !== undefined) {
			this.setProcessOrder(config.processInOrder);
		}
	}

	onEnabledChanged(enabled) {
		if (!enabled && this.connected) {
			// Disconnect when disabled
			this.disconnect();
		} else if (enabled && this.channel && !this.connected) {
			// Reconnect when re-enabled if we have a channel
			this.connect(this.channel);
		}
	}

	onDetach() {
		super.onDetach();
		this.disconnect();
	}

	dispose() {
		super.dispose();

		// Remove config listener
		if (this._configChangeHandler) {
			window.chatConfigs.removeListener(this._configChangeHandler);
		}

		this.disconnect();
		this.messages = [];
		this.commandQueue = [];
		this.currentCommandStates = [];
		this.userCooldowns.clear();
		this.commandCooldowns.clear();
		this.displayedMessages.clear();

		this._channelInput = null;
		this._connectButton = null;
		this._statusIndicator = null;
		this._messageContainer = null;
		this._clearButton = null;
		this._configSelect = null;
		this._configureButton = null;
		this._processOrderCheckbox = null;
		this._queueSizeDisplay = null;
	}
}