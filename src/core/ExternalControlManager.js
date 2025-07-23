// ./src/core/ExternalControlManager.js

/**
 * ExternalControlManager handles external control sources
 * Supports both browser messaging (BroadcastChannel) and WebSocket connections
 * Uses UIManager for all UI operations following the established architecture
 */
export class ExternalControlManager {
	constructor(pipeline, uiManager) {
		this.pipeline = pipeline;
		this.uiManager = uiManager;
		this.pipelineManager = null; // Will be set later via setPipelineManager

		// Connection state
		this.isInitialized = false;
		this.currentRoom = '';

		// Browser messaging
		this.broadcastChannel = null;
		this.broadcastEnabled = false;

		// WebSocket connection
		this.websocket = null;
		this.websocketEnabled = false;
		this.websocketUrl = 'wss://rollsocket.com/GLaMS_control';
		this.reconnectAttempts = 0;
		this.maxReconnectAttempts = 5;
		this.reconnectDelay = 1000; // Start with 1 second
		this.reconnectTimer = null;

		// Message handling
		this.messageHandlers = new Map();
		this.messageStats = {
			received: 0,
			processed: 0,
			errors: 0,
			lastMessage: null
		};

		// Setup default message handlers
		this.setupDefaultHandlers();
	}

	/**
	 * Initialize the external control manager
	 * Sets up event listeners via UIManager
	 */
	initialize() {
		this.isInitialized = true;
		this.setupEventListeners();
		this.updateUI();
		this.uiManager.logMessage('External control manager initialized');
	}

	/**
	 * Setup UI event listeners via UIManager
	 */
	setupEventListeners() {
		// Room settings
		this.uiManager.addEventListenerSafe('roomNameInput', 'input', () => {
			this.updateConnectionButtons();
		});

		// Browser messaging controls
		this.uiManager.addEventListenerSafe('enableBrowserMessaging', 'change', (e) => {
			if (e.target.checked) {
				this.enableBrowserMessaging();
			} else {
				this.disableBrowserMessaging();
			}
		});

		// WebSocket controls
		this.uiManager.addEventListenerSafe('enableWebSocket', 'change', (e) => {
			if (e.target.checked) {
				this.enableWebSocket();
			} else {
				this.disableWebSocket();
			}
		});

		// Connect/Disconnect buttons
		this.uiManager.addEventListenerSafe('connectExternalBtn', 'click', () => {
			this.connectToRoom();
		});

		this.uiManager.addEventListenerSafe('disconnectExternalBtn', 'click', () => {
			this.disconnectFromRoom();
		});

		// Test message button
		this.uiManager.addEventListenerSafe('sendTestMessageBtn', 'click', () => {
			this.sendTestMessage();
		});

		// Clear stats button
		this.uiManager.addEventListenerSafe('clearStatsBtn', 'click', () => {
			this.clearStats();
		});
	}

	/**
	 * Setup default message handlers
	 */
	setupDefaultHandlers() {
		// Pipeline control handlers
		this.registerMessageHandler('executeAction', (data) => {
			return this.handleExecuteAction(data);
		});

		this.registerMessageHandler('getStatus', (data) => {
			return this.handleGetStatus(data);
		});

		this.registerMessageHandler('ping', (data) => {
			return { type: 'pong', timestamp: Date.now(), originalData: data };
		});

		this.registerMessageHandler('addManipulator', (data) => {
			return this.handleAddManipulator(data);
		});

		this.registerMessageHandler('removeManipulator', (data) => {
			return this.handleRemoveManipulator(data);
		});

		this.registerMessageHandler('configureManipulator', (data) => {
			return this.handleConfigureManipulator(data);
		});

		this.registerMessageHandler('listManipulators', (data) => {
			return this.handleListManipulators(data);
		});

		this.registerMessageHandler('getManipulatorInfo', (data) => {
			return this.handleGetManipulatorInfo(data);
		});

		this.registerMessageHandler('getManipulatorActions', (data) => {
			return this.handleGetManipulatorActions(data);
		});

		this.registerMessageHandler('moveManipulator', (data) => {
			return this.handleMoveManipulator(data);
		});

		this.registerMessageHandler('loadPipelineConfig', (data) => {
			return this.handleLoadPipelineConfig(data);
		});

		this.registerMessageHandler('savePipelineConfig', (data) => {
			return this.handleSavePipelineConfig(data);
		});

		this.registerMessageHandler('bulkExecute', (data) => {
			return this.handleBulkExecute(data);
		});
	}

	/**
	 * Register a message handler
	 * @param {string} type - Message type
	 * @param {Function} handler - Handler function
	 */
	registerMessageHandler(type, handler) {
		this.messageHandlers.set(type, handler);
		this.uiManager.logMessage(`Registered handler for message type: ${type}`);
	}

	/**
	 * Unregister a message handler
	 * @param {string} type - Message type
	 */
	unregisterMessageHandler(type) {
		if (this.messageHandlers.delete(type)) {
			this.uiManager.logMessage(`Unregistered handler for message type: ${type}`);
		}
	}

	/**
	 * Enable browser messaging
	 */
	enableBrowserMessaging() {
		try {
			if (!this.currentRoom) {
				this.uiManager.logMessage('Cannot enable browser messaging: no room specified');
				this.updateUI();
				return;
			}

			const channelName = `swicc_control_${this.currentRoom}`;
			this.broadcastChannel = new BroadcastChannel(channelName);

			this.broadcastChannel.onmessage = (event) => {
				this.handleBrowserMessage(event.data);
			};

			this.broadcastEnabled = true;
			this.uiManager.logMessage(`Browser messaging enabled for room: ${this.currentRoom}`);
			this.updateUI();

		} catch (error) {
			this.uiManager.logMessage(`Error enabling browser messaging: ${error.message}`);
			this.broadcastEnabled = false;
			this.updateUI();
		}
	}

	/**
	 * Disable browser messaging
	 */
	disableBrowserMessaging() {
		if (this.broadcastChannel) {
			this.broadcastChannel.close();
			this.broadcastChannel = null;
		}
		this.broadcastEnabled = false;
		this.uiManager.logMessage('Browser messaging disabled');
		this.updateUI();
	}

	/**
	 * Enable WebSocket connection
	 */
	enableWebSocket() {
		try {
			if (!this.currentRoom) {
				this.uiManager.logMessage('Cannot enable WebSocket: no room specified');
				this.updateUI();
				return;
			}

			this.connectWebSocket();

		} catch (error) {
			this.uiManager.logMessage(`Error enabling WebSocket: ${error.message}`);
			this.websocketEnabled = false;
			this.updateUI();
		}
	}

	/**
	 * Disable WebSocket connection
	 */
	disableWebSocket() {
		this.disconnectWebSocket();
		this.websocketEnabled = false;
		this.uiManager.logMessage('WebSocket disabled');
		this.updateUI();
	}

	/**
	 * Connect to WebSocket server
	 */
	connectWebSocket() {
		try {
			this.disconnectWebSocket(); // Clean up existing connection

			this.uiManager.logMessage(`Connecting to WebSocket: ${this.websocketUrl}`);
			this.websocket = new WebSocket(this.websocketUrl);

			this.websocket.onopen = () => {
				this.uiManager.logMessage('WebSocket connected');
				this.reconnectAttempts = 0;
				this.reconnectDelay = 1000;

				// Join the room
				this.websocket.send("+join " + this.currentRoom );
				this.uiManager.logMessage(`Joined WebSocket room: ${this.currentRoom}`);

				this.websocketEnabled = true;
				this.updateUI();
			};

			this.websocket.onmessage = (event) => {
				this.handleWebSocketMessage(event.data);
			};

			this.websocket.onclose = (event) => {
				this.uiManager.logMessage(`WebSocket closed: ${event.code} ${event.reason}`);
				this.websocketEnabled = false;
				this.updateUI();

				// Attempt reconnection if it wasn't a manual disconnect
				if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
					this.scheduleReconnect();
				}
			};

			this.websocket.onerror = (error) => {
				this.uiManager.logMessage(`WebSocket error: ${error}`);
				this.websocketEnabled = false;
				this.updateUI();
			};

		} catch (error) {
			this.uiManager.logMessage(`Error connecting WebSocket: ${error.message}`);
			this.websocketEnabled = false;
			this.updateUI();
		}
	}

	/**
	 * Disconnect from WebSocket server
	 */
	disconnectWebSocket() {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}

		if (this.websocket) {
			this.websocket.close(1000, 'Manual disconnect');
			this.websocket = null;
		}
	}

	/**
	 * Schedule WebSocket reconnection
	 */
	scheduleReconnect() {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
		}

		this.reconnectAttempts++;
		const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff

		this.uiManager.logMessage(`Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

		this.reconnectTimer = setTimeout(() => {
			if (this.reconnectAttempts <= this.maxReconnectAttempts) {
				this.connectWebSocket();
			} else {
				this.uiManager.logMessage('Max reconnection attempts reached');
			}
		}, delay);
	}

	/**
	 * Connect to a room (enables selected connection methods)
	 */
	connectToRoom() {
		const roomName = this.uiManager.getInputValue('roomNameInput');
		if (!roomName.trim()) {
			this.uiManager.logMessage('Please enter a room name');
			return;
		}

		this.currentRoom = roomName.trim();

		// Check which connection methods are enabled
		const browserEnabled = document.getElementById('enableBrowserMessaging')?.checked;
		const websocketEnabled = document.getElementById('enableWebSocket')?.checked;

		if (browserEnabled) {
			this.enableBrowserMessaging();
		}

		if (websocketEnabled) {
			this.enableWebSocket();
		}

		if (!browserEnabled && !websocketEnabled) {
			this.uiManager.logMessage('Please select at least one connection method');
			return;
		}

		this.updateUI();
	}

	/**
	 * Disconnect from current room
	 */
	disconnectFromRoom() {
		this.disableBrowserMessaging();
		this.disableWebSocket();
		this.currentRoom = '';
		this.updateUI();
		this.uiManager.logMessage('Disconnected from room');
	}

	/**
	 * Handle browser message
	 * @param {*} data - Message data
	 */
	handleBrowserMessage(data) {
		try {
			this.messageStats.received++;
			this.messageStats.lastMessage = data;

			this.uiManager.logMessage(`Browser message received: ${JSON.stringify(data)}`);
			const result = this.processMessage(data);

			// Send response back through broadcast channel if needed
			if (result && data.responseId) {
				this.broadcastChannel.postMessage({
					type: 'response',
					responseId: data.responseId,
					result: result
				});
			}

		} catch (error) {
			this.messageStats.errors++;
			this.uiManager.logMessage(`Error handling browser message: ${error.message}`);
		}

		this.updateStats();
	}

	/**
	 * Handle WebSocket message
	 * @param {string} rawData - Raw message data
	 */
	handleWebSocketMessage(rawData) {
		try {
			this.messageStats.received++;

			const data = JSON.parse(rawData);
			this.messageStats.lastMessage = data;

			// Extract message from WebSocket wrapper
			let message = data;
			if (data.message) {
				message = data.message;
			}

			this.uiManager.logMessage(`WebSocket message received: ${JSON.stringify(message)}`);
			const result = this.processMessage(message);

			// Send response back through WebSocket if needed
			if (result && this.websocket && this.websocket.readyState === WebSocket.OPEN) {
				this.websocket.send(JSON.stringify({
					type: 'response',
					result: result
				}));
			}

		} catch (error) {
			this.messageStats.errors++;
			this.uiManager.logMessage(`Error handling WebSocket message: ${error.message}`);
		}

		this.updateStats();
	}

	/**
	 * Process incoming message
	 * @param {Object} message - Message to process
	 * @returns {*} Processing result
	 */
	processMessage(message) {
		try {
			if (!message || typeof message !== 'object') {
				throw new Error('Invalid message format');
			}

			const { type, ...data } = message;

			if (!type) {
				throw new Error('Message missing type field');
			}

			const handler = this.messageHandlers.get(type);
			if (!handler) {
				throw new Error(`No handler for message type: ${type}`);
			}

			const result = handler(data);
			this.messageStats.processed++;

			return result;

		} catch (error) {
			this.messageStats.errors++;
			this.uiManager.logMessage(`Error processing message: ${error.message}`);
			return { error: error.message };
		}
	}

	/**
	 * Handle execute action message
	 * @param {Object} data - Action data
	 * @returns {*} Action result
	 */
	handleExecuteAction(data) {
		const { manipulatorId, actionName, params } = data;

		if (!manipulatorId || !actionName) {
			throw new Error('Missing manipulatorId or actionName');
		}

		try {
			const result = this.pipeline.executeAction(manipulatorId, actionName, JSON.parse(params) || {});
			this.uiManager.logMessage(`External action executed: ${actionName} on ${manipulatorId}`);
			return { success: true, result: result };
		} catch (error) {
			this.uiManager.logMessage(`External action failed: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Handle get status message
	 * @param {Object} data - Request data
	 * @returns {Object} Status information
	 */
	handleGetStatus(data) {
		const manipulators = this.pipeline.getManipulators();

		return {
			room: this.currentRoom,
			connections: {
				browser: this.broadcastEnabled,
				websocket: this.websocketEnabled
			},
			stats: this.messageStats,
			pipeline: {
				manipulatorCount: manipulators.length,
				manipulators: manipulators.map(m => {
					const id = this.pipeline.getId(m);
					const actions = Array.from(m.getActions().keys());
					return {
						id: id,
						type: m.constructor.name,
						displayName: m.constructor.displayName,
						enabled: m.enabled,
						title: m.fullTitle,
						availableActions: actions,
						config: m.getConfig()
					};
				})
			},
			availableManipulatorTypes: this.pipelineManager ?
				this.pipelineManager.getAvailableTypes() : [],
			system: {
				timestamp: Date.now(),
				version: '1.0.0'
			}
		};
	}

	/**
	 * Handle add manipulator message
	 * @param {Object} data - Manipulator data
	 * @returns {Object} Result
	 */
	handleAddManipulator(data) {
		const { type, config, position } = data;

		if (!type) {
			throw new Error('Missing manipulator type');
		}

		if (!this.pipelineManager) {
			throw new Error('Pipeline manager not available');
		}

		try {
			const manipulator = this.pipelineManager.addManipulator(type, config || {});

			if (!manipulator) {
				throw new Error(`Failed to create manipulator of type: ${type}`);
			}

			const manipulatorId = this.pipeline.getId(manipulator);

			// Move to specific position if requested
			if (typeof position === 'number' && position >= 0) {
				const allManipulators = this.pipeline.getManipulators();
				const currentIndex = allManipulators.indexOf(manipulator);
				const targetIndex = Math.min(position, allManipulators.length - 1);

				if (currentIndex !== targetIndex) {
					this.pipeline.move(manipulator, targetIndex);
					this.uiManager.logMessage(`Moved ${type} to position ${targetIndex}`);
				}
			}

			this.uiManager.logMessage(`External request: added ${type} manipulator`);

			return {
				success: true,
				manipulatorId: manipulatorId,
				type: type,
				displayName: manipulator.constructor.displayName,
				position: this.pipeline.getManipulators().indexOf(manipulator),
				availableActions: Array.from(manipulator.getActions().keys())
			};

		} catch (error) {
			this.uiManager.logMessage(`Failed to add manipulator: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Handle remove manipulator message
	 * @param {Object} data - Manipulator data
	 * @returns {Object} Result
	 */
	handleRemoveManipulator(data) {
		const { manipulatorId } = data;

		if (!manipulatorId) {
			throw new Error('Missing manipulatorId');
		}

		if (!this.pipelineManager) {
			throw new Error('Pipeline manager not available');
		}

		try {
			const manipulator = this.pipelineManager.getManipulatorById(manipulatorId);

			if (!manipulator) {
				throw new Error(`Manipulator not found: ${manipulatorId}`);
			}

			const type = manipulator.constructor.name;
			const displayName = manipulator.constructor.displayName;

			this.pipelineManager.removeManipulator(manipulator, manipulator._uiElement);

			this.uiManager.logMessage(`External request: removed ${displayName} manipulator`);

			return {
				success: true,
				removedId: manipulatorId,
				type: type,
				displayName: displayName
			};

		} catch (error) {
			this.uiManager.logMessage(`Failed to remove manipulator: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Handle configure manipulator message
	 * @param {Object} data - Configuration data
	 * @returns {Object} Result
	 */
	handleConfigureManipulator(data) {
		const { manipulatorId, config } = data;

		if (!manipulatorId) {
			throw new Error('Missing manipulatorId');
		}

		if (!this.pipelineManager) {
			throw new Error('Pipeline manager not available');
		}

		try {
			const manipulator = this.pipelineManager.getManipulatorById(manipulatorId);

			if (!manipulator) {
				throw new Error(`Manipulator not found: ${manipulatorId}`);
			}

			const oldConfig = manipulator.getConfig();
			manipulator.setConfig(config || {});
			const newConfig = manipulator.getConfig();

			this.uiManager.logMessage(`External request: configured ${manipulator.constructor.displayName} manipulator`);

			return {
				success: true,
				manipulatorId: manipulatorId,
				type: manipulator.constructor.name,
				displayName: manipulator.constructor.displayName,
				oldConfig: oldConfig,
				newConfig: newConfig
			};

		} catch (error) {
			this.uiManager.logMessage(`Failed to configure manipulator: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Handle list manipulators message
	 * @param {Object} data - Request data
	 * @returns {Object} Result
	 */
	handleListManipulators(data) {
		const manipulators = this.pipeline.getManipulators();

		return {
			success: true,
			count: manipulators.length,
			manipulators: manipulators.map((m, index) => ({
				id: this.pipeline.getId(m),
				type: m.constructor.name,
				displayName: m.constructor.displayName,
				title: m.fullTitle,
				enabled: m.enabled,
				position: index,
				actionCount: m.getActions().size
			}))
		};
	}

	/**
	 * Handle get manipulator info message
	 * @param {Object} data - Request data
	 * @returns {Object} Result
	 */
	handleGetManipulatorInfo(data) {
		const { manipulatorId } = data;

		if (!manipulatorId) {
			throw new Error('Missing manipulatorId');
		}

		if (!this.pipelineManager) {
			throw new Error('Pipeline manager not available');
		}

		try {
			const manipulator = this.pipelineManager.getManipulatorById(manipulatorId);

			if (!manipulator) {
				throw new Error(`Manipulator not found: ${manipulatorId}`);
			}

			const actions = manipulator.getActions();
			const actionsInfo = {};

			actions.forEach((action, name) => {
				actionsInfo[name] = {
					displayName: action.displayName,
					description: action.description,
					parameters: action.parameters || []
				};
			});

			return {
				success: true,
				id: manipulatorId,
				type: manipulator.constructor.name,
				displayName: manipulator.constructor.displayName,
				title: manipulator.fullTitle,
				enabled: manipulator.enabled,
				position: this.pipelineManager.getManipulatorIndex(manipulator),
				config: manipulator.getConfig(),
				actions: actionsInfo
			};

		} catch (error) {
			this.uiManager.logMessage(`Failed to get manipulator info: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Handle get manipulator actions message
	 * @param {Object} data - Request data
	 * @returns {Object} Result
	 */
	handleGetManipulatorActions(data) {
		const { manipulatorId } = data;

		if (!manipulatorId) {
			throw new Error('Missing manipulatorId');
		}

		if (!this.pipelineManager) {
			throw new Error('Pipeline manager not available');
		}

		try {
			const manipulator = this.pipelineManager.getManipulatorById(manipulatorId);

			if (!manipulator) {
				throw new Error(`Manipulator not found: ${manipulatorId}`);
			}

			const actions = manipulator.getActions();
			const actionsArray = [];

			actions.forEach((action, name) => {
				actionsArray.push({
					name: name,
					displayName: action.displayName,
					description: action.description,
					parameters: action.parameters || []
				});
			});

			return {
				success: true,
				manipulatorId: manipulatorId,
				type: manipulator.constructor.name,
				displayName: manipulator.constructor.displayName,
				actions: actionsArray
			};

		} catch (error) {
			this.uiManager.logMessage(`Failed to get manipulator actions: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Handle move manipulator message
	 * @param {Object} data - Move data
	 * @returns {Object} Result
	 */
	handleMoveManipulator(data) {
		const { manipulatorId, newPosition, direction } = data;

		if (!manipulatorId) {
			throw new Error('Missing manipulatorId');
		}

		if (!this.pipelineManager) {
			throw new Error('Pipeline manager not available');
		}

		try {
			const manipulator = this.pipelineManager.getManipulatorById(manipulatorId);

			if (!manipulator) {
				throw new Error(`Manipulator not found: ${manipulatorId}`);
			}

			const oldPosition = this.pipelineManager.getManipulatorIndex(manipulator);
			let targetPosition;

			if (typeof newPosition === 'number') {
				targetPosition = newPosition;
			} else if (direction === 'up') {
				targetPosition = Math.max(0, oldPosition - 1);
			} else if (direction === 'down') {
				const maxPos = this.pipeline.getManipulators().length - 1;
				targetPosition = Math.min(maxPos, oldPosition + 1);
			} else {
				throw new Error('Must specify either newPosition or direction (up/down)');
			}

			// Clamp to valid range
			const maxPos = this.pipeline.getManipulators().length - 1;
			targetPosition = Math.max(0, Math.min(maxPos, targetPosition));

			if (oldPosition !== targetPosition) {
				this.pipeline.move(manipulator, targetPosition);

				// Move UI element as well
				const uiElement = manipulator._uiElement;
				if (uiElement) {
					const moveDirection = targetPosition > oldPosition ? 1 : -1;
					this.pipelineManager.moveManipulatorUI(uiElement, moveDirection, targetPosition);
				}

				this.uiManager.logMessage(`External request: moved ${manipulator.constructor.displayName} from ${oldPosition} to ${targetPosition}`);
			}

			return {
				success: true,
				manipulatorId: manipulatorId,
				oldPosition: oldPosition,
				newPosition: targetPosition,
				moved: oldPosition !== targetPosition
			};

		} catch (error) {
			this.uiManager.logMessage(`Failed to move manipulator: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Handle bulk execute message (execute multiple actions)
	 * @param {Object} data - Bulk operation data
	 * @returns {Object} Result
	 */
	handleBulkExecute(data) {
		const { operations } = data;

		if (!Array.isArray(operations)) {
			throw new Error('Operations must be an array');
		}

		const results = [];
		let successCount = 0;
		let errorCount = 0;

		for (let i = 0; i < operations.length; i++) {
			const operation = operations[i];

			try {
				let result;

				if (operation.type === 'executeAction') {
					result = this.handleExecuteAction(operation);
				} else if (operation.type === 'addManipulator') {
					result = this.handleAddManipulator(operation);
				} else if (operation.type === 'removeManipulator') {
					result = this.handleRemoveManipulator(operation);
				} else if (operation.type === 'configureManipulator') {
					result = this.handleConfigureManipulator(operation);
				} else if (operation.type === 'moveManipulator') {
					result = this.handleMoveManipulator(operation);
				} else {
					throw new Error(`Unknown bulk operation type: ${operation.type}`);
				}

				results.push({ index: i, success: true, result: result });
				successCount++;

			} catch (error) {
				results.push({
					index: i,
					success: false,
					error: error.message,
					operation: operation
				});
				errorCount++;
			}
		}

		this.uiManager.logMessage(`Bulk operation: ${successCount} succeeded, ${errorCount} failed`);

		return {
			success: errorCount === 0,
			totalOperations: operations.length,
			successCount: successCount,
			errorCount: errorCount,
			results: results
		};
	}

	/**
	 * Handle load pipeline config message
	 * @param {Object} data - Configuration data
	 * @returns {Object} Result
	 */
	handleLoadPipelineConfig(data) {
		const { config } = data;

		if (!config) {
			throw new Error('Missing config');
		}

		if (!this.pipelineManager) {
			throw new Error('Pipeline manager not available');
		}

		try {
			this.pipelineManager.loadConfig(config);

			this.uiManager.logMessage(`External request: loaded pipeline configuration with ${config.length} manipulator(s)`);

			return {
				success: true,
				manipulatorCount: config.length,
				loadedTypes: config.map(item => item.type)
			};

		} catch (error) {
			this.uiManager.logMessage(`Failed to load pipeline config: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Handle save pipeline config message
	 * @param {Object} data - Request data
	 * @returns {Object} Result
	 */
	handleSavePipelineConfig(data) {
		if (!this.pipelineManager) {
			throw new Error('Pipeline manager not available');
		}

		try {
			const config = this.pipelineManager.getCurrentConfig();

			this.uiManager.logMessage(`External request: saved pipeline configuration`);

			return {
				success: true,
				config: config,
				manipulatorCount: config.length,
				timestamp: new Date().toISOString()
			};

		} catch (error) {
			this.uiManager.logMessage(`Failed to save pipeline config: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Send a test message
	 */
	sendTestMessage() {
		const testMessage = {
			type: 'ping',
			timestamp: Date.now(),
			source: 'test'
		};

		if (this.broadcastEnabled && this.broadcastChannel) {
			this.broadcastChannel.postMessage(testMessage);
			this.uiManager.logMessage('Test message sent via browser messaging');
		}

		if (this.websocketEnabled && this.websocket && this.websocket.readyState === WebSocket.OPEN) {
			this.websocket.send(JSON.stringify(testMessage));
			this.uiManager.logMessage('Test message sent via WebSocket');
		}

		if (!this.broadcastEnabled && !this.websocketEnabled) {
			this.uiManager.logMessage('No active connections to send test message');
		}
	}

	/**
	 * Update UI state - delegates to specific update methods
	 */
	updateUI() {
		this.updateConnectionStatus();
		this.updateConnectionButtons();
		this.updateStats();
	}

	/**
	 * Update connection status display via UIManager
	 */
	updateConnectionStatus() {
		// Update browser messaging status
		this.uiManager.updateExternalControlStatus('browser', this.broadcastEnabled);

		// Update WebSocket status
		this.uiManager.updateExternalControlStatus('websocket', this.websocketEnabled);
	}

	/**
	 * Update connection button states via UIManager
	 */
	updateConnectionButtons() {
		const roomName = this.uiManager.getInputValue('roomNameInput');
		const hasRoom = roomName && roomName.trim();
		const isConnected = this.broadcastEnabled || this.websocketEnabled;

		// Enable/disable connect button
		const connectBtn = document.getElementById('connectExternalBtn');
		if (connectBtn) {
			connectBtn.disabled = !hasRoom || isConnected;
		}

		// Enable/disable disconnect button
		const disconnectBtn = document.getElementById('disconnectExternalBtn');
		if (disconnectBtn) {
			disconnectBtn.disabled = !isConnected;
		}
	}

	/**
	 * Update statistics display via UIManager
	 */
	updateStats() {
		this.uiManager.updateExternalControlStats(this.messageStats);
	}

	/**
	 * Clear statistics
	 */
	clearStats() {
		this.messageStats = {
			received: 0,
			processed: 0,
			errors: 0,
			lastMessage: null
		};
		this.updateStats();
		this.uiManager.logMessage('External control statistics cleared');
	}

	/**
	 * Get external control statistics
	 * @returns {Object} Statistics object
	 */
	getStatistics() {
		return {
			currentRoom: this.currentRoom,
			connections: {
				browser: this.broadcastEnabled,
				websocket: this.websocketEnabled
			},
			messageStats: { ...this.messageStats },
			handlers: Array.from(this.messageHandlers.keys()),
			reconnectAttempts: this.reconnectAttempts
		};
	}

	/**
	 * Set pipeline manager reference for advanced operations
	 * @param {Object} pipelineManager - Pipeline manager instance
	 */
	setPipelineManager(pipelineManager) {
		this.pipelineManager = pipelineManager;
		this.uiManager.logMessage('Pipeline manager reference set for external control');
	}

	/**
	 * Get connection status for external reporting
	 * @returns {Object} Connection status object
	 */
	getConnectionStatus() {
		return {
			room: this.currentRoom,
			browser: {
				enabled: this.broadcastEnabled,
				connected: this.broadcastChannel !== null
			},
			websocket: {
				enabled: this.websocketEnabled,
				connected: this.websocket && this.websocket.readyState === WebSocket.OPEN,
				url: this.websocketUrl,
				reconnectAttempts: this.reconnectAttempts
			}
		};
	}

	/**
	 * Check if any external connections are active
	 * @returns {boolean} True if any connection is active
	 */
	hasActiveConnections() {
		return this.broadcastEnabled || this.websocketEnabled;
	}

	/**
	 * Broadcast a message to all connected clients
	 * @param {Object} message - Message to broadcast
	 */
	broadcastMessage(message) {
		let sent = false;

		if (this.broadcastEnabled && this.broadcastChannel) {
			this.broadcastChannel.postMessage(message);
			sent = true;
		}

		if (this.websocketEnabled && this.websocket && this.websocket.readyState === WebSocket.OPEN) {
			this.websocket.send(JSON.stringify(message));
			sent = true;
		}

		if (sent) {
			this.uiManager.logMessage(`Broadcast message sent: ${message.type}`);
		} else {
			this.uiManager.logMessage('No active connections for broadcast');
		}

		return sent;
	}

	/**
	 * Get list of available message handlers
	 * @returns {Array} Array of handler information
	 */
	getAvailableHandlers() {
		return Array.from(this.messageHandlers.keys()).map(type => ({
			type: type,
			registered: true
		}));
	}

	/**
	 * Validate external control configuration
	 * @param {Object} config - Configuration to validate
	 * @returns {Object} Validation result
	 */
	validateConfig(config) {
		const errors = [];
		const warnings = [];

		if (!config.room || typeof config.room !== 'string') {
			errors.push('Room name is required and must be a string');
		}

		if (!config.enableBrowser && !config.enableWebSocket) {
			warnings.push('At least one connection method should be enabled');
		}

		if (config.websocketUrl && !config.websocketUrl.startsWith('ws')) {
			errors.push('WebSocket URL must start with ws:// or wss://');
		}

		return {
			valid: errors.length === 0,
			errors: errors,
			warnings: warnings
		};
	}

	/**
	 * Apply external control configuration
	 * @param {Object} config - Configuration to apply
	 */
	applyConfig(config) {
		const validation = this.validateConfig(config);
		if (!validation.valid) {
			throw new Error(`Invalid config: ${validation.errors.join(', ')}`);
		}

		// Apply room name
		if (config.room) {
			this.uiManager.setInputValue('roomNameInput', config.room);
		}

		// Apply WebSocket URL if provided
		if (config.websocketUrl) {
			this.websocketUrl = config.websocketUrl;
		}

		// Apply connection settings
		if (config.enableBrowser) {
			const checkbox = document.getElementById('enableBrowserMessaging');
			if (checkbox) checkbox.checked = true;
		}

		if (config.enableWebSocket) {
			const checkbox = document.getElementById('enableWebSocket');
			if (checkbox) checkbox.checked = true;
		}

		this.uiManager.logMessage('External control configuration applied');
	}

	/**
	 * Get current external control configuration
	 * @returns {Object} Current configuration
	 */
	getCurrentConfig() {
		return {
			room: this.currentRoom,
			websocketUrl: this.websocketUrl,
			enableBrowser: this.broadcastEnabled,
			enableWebSocket: this.websocketEnabled,
			maxReconnectAttempts: this.maxReconnectAttempts,
			reconnectDelay: this.reconnectDelay
		};
	}

	/**
	 * Dispose of the external control manager
	 */
	dispose() {
		try {
			// Disconnect from all services
			this.disconnectFromRoom();

			// Clear handlers
			this.messageHandlers.clear();

			// Reset state
			this.messageStats = { received: 0, processed: 0, errors: 0, lastMessage: null };
			this.isInitialized = false;
			this.pipelineManager = null;

			this.uiManager.logMessage('External control manager disposed');

		} catch (error) {
			console.error('Error during ExternalControlManager disposal:', error);
		}
	}
}