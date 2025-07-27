// ./src/utils/GLaMSController.js

/**
 * GLaMS Controller - client for controlling GLaMS
 * Provides high-level methods for manipulator management, pipeline control, and system monitoring
 */
export class GLaMSController {
	constructor(options = {}) {
		// Connection setup
		this.broadcastChannel = null;
		this.websocket = null;
		this.isConnected = false;
		this.currentRoom = '';
		this.connectionMethod = 'websocket'; // 'browser' or 'websocket'

		// Event callbacks
		this.onMessage = options.onMessage || this._defaultMessageHandler;
		this.onConnect = options.onConnect || this._defaultConnectHandler;
		this.onDisconnect = options.onDisconnect || this._defaultDisconnectHandler;
		this.onError = options.onError || this._defaultErrorHandler;
		this.onStatusUpdate = options.onStatusUpdate || this._defaultStatusHandler;

		// WebSocket URL
		this.wsUrl = options.wsUrl || 'wss://rollsocket.com/GLaMS_control/';

		// Response handling
		this.pendingRequests = new Map();
		this.requestTimeout = options.requestTimeout || 5000; // 5 seconds
		this.nextRequestId = 1;

		// Caching
		this.cache = {
			status: null,
			manipulators: null,
			availableTypes: null,
			lastUpdate: null
		};
		this.cacheTimeout = options.cacheTimeout || 30000; // 30 seconds

		// Auto-reconnection
		this.autoReconnect = options.autoReconnect !== false;
		this.reconnectAttempts = 0;
		this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
		this.reconnectDelay = options.reconnectDelay || 1000;
		this.reconnectTimer = null;

		// Statistics
		this.stats = {
			messagesSent: 0,
			messagesReceived: 0,
			errors: 0,
			lastError: null,
			connectedAt: null,
			uptime: 0
		};

		// Event emitter functionality
		this.eventListeners = new Map();
	}

	// ==================== CONNECTION MANAGEMENT ====================

	/**
	 * Connect to GLaMS system
	 * @param {string} roomName - Room to connect to
	 * @param {string} method - Connection method ('browser' or 'websocket')
	 * @returns {Promise<void>}
	 */
	async connect(roomName, method = 'websocket') {
		if (!roomName) {
			throw new Error('Room name is required');
		}

		this.currentRoom = roomName;
		this.connectionMethod = method;
		this.stats.connectedAt = Date.now();

		if (method === 'browser') {
			return this._connectBrowser();
		} else if (method === 'websocket') {
			return this._connectWebSocket();
		} else {
			throw new Error('Invalid connection method. Use "browser" or "websocket"');
		}
	}

	/**
	 * Disconnect from GLaMS system
	 */
	disconnect() {
		this._clearReconnectTimer();

		if (this.broadcastChannel) {
			this.broadcastChannel.close();
			this.broadcastChannel = null;
		}

		if (this.websocket) {
			this.websocket.close(1000, 'Manual disconnect');
			this.websocket = null;
		}

		this.isConnected = false;
		this.reconnectAttempts = 0;
		this._clearCache();
		this.onDisconnect('Manual disconnect');
	}

	/**
	 * Check if connection is active and healthy
	 * @returns {boolean}
	 */
	isConnectionHealthy() {
		if (this.connectionMethod === 'browser') {
			return this.broadcastChannel !== null && this.isConnected;
		} else if (this.connectionMethod === 'websocket') {
			return this.websocket !== null &&
				this.websocket.readyState === WebSocket.OPEN &&
				this.isConnected;
		}
		return false;
	}

	// ==================== MESSAGE HANDLING ====================

	/**
	 * Send message with response handling
	 * @param {Object} message - Message to send
	 * @param {boolean} expectResponse - Whether to wait for response
	 * @returns {Promise<any>}
	 */
	async sendMessageWithResponse(message, expectResponse = true) {
		if (!this.isConnected) {
			throw new Error('Not connected to GLaMS system');
		}

		const messageWithId = {
			...message,
			requestId: expectResponse ? this._generateRequestId() : undefined,
			timestamp: Date.now()
		};

		let responsePromise;
		if (expectResponse && messageWithId.requestId) {
			responsePromise = this._createResponsePromise(messageWithId.requestId);
		}

		try {
			if (this.connectionMethod === 'browser' && this.broadcastChannel) {
				this.broadcastChannel.postMessage(messageWithId);
			} else if (this.connectionMethod === 'websocket' && this.websocket && this.websocket.readyState === WebSocket.OPEN) {
				this.websocket.send(JSON.stringify(messageWithId));
			} else {
				throw new Error('No active connection');
			}

			this.stats.messagesSent++;
			this.emit('messageSent', messageWithId);

			return expectResponse ? await responsePromise : null;

		} catch (error) {
			this.stats.errors++;
			this.stats.lastError = error.message;
			this.onError(`Send error: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Legacy sendMessage method for backwards compatibility
	 */
	sendMessage(message) {
		return this.sendMessageWithResponse(message, false);
	}

	// ==================== SYSTEM STATUS & MONITORING ====================

	/**
	 * Get comprehensive system status
	 * @param {boolean} useCache - Whether to use cached data
	 * @returns {Promise<Object>}
	 */
	async getSystemStatus(useCache = true) {
		if (useCache && this._isCacheValid('status')) {
			return this.cache.status;
		}

		const status = await this.sendMessageWithResponse({ type: 'getStatus' });
		this.cache.status = status;
		this.cache.lastUpdate = Date.now();
		this.onStatusUpdate(status);
		return status;
	}

	/**
	 * Ping the system to check connectivity
	 * @returns {Promise<Object>}
	 */
	async ping() {
		const startTime = Date.now();
		const response = await this.sendMessageWithResponse({ type: 'ping' });
		const latency = Date.now() - startTime;

		this.emit('ping', { latency, response });
		return { ...response, latency };
	}

	/**
	 * Monitor system health continuously
	 * @param {number} interval - Monitoring interval in milliseconds
	 * @returns {Function} Stop monitoring function
	 */
	startHealthMonitoring(interval = 30000) {
		const monitor = setInterval(async () => {
			try {
				const status = await this.getSystemStatus(false);
				this.emit('healthCheck', {
					healthy: true,
					status,
					timestamp: Date.now()
				});
			} catch (error) {
				this.emit('healthCheck', {
					healthy: false,
					error: error.message,
					timestamp: Date.now()
				});
			}
		}, interval);

		return () => clearInterval(monitor);
	}

	// ==================== MANIPULATOR MANAGEMENT ====================

	/**
	 * Get list of all manipulators
	 * @param {boolean} useCache - Whether to use cached data
	 * @returns {Promise<Array>}
	 */
	async getManipulators(useCache = true) {
		if (useCache && this._isCacheValid('manipulators')) {
			return this.cache.manipulators;
		}

		const response = await this.sendMessageWithResponse({ type: 'listManipulators' });
		this.cache.manipulators = response.manipulators || [];
		this.cache.lastUpdate = Date.now();
		return this.cache.manipulators;
	}

	/**
	 * Get detailed information about a specific manipulator
	 * @param {string} manipulatorId - Manipulator ID
	 * @returns {Promise<Object>}
	 */
	async getManipulatorInfo(manipulatorId) {
		if (!manipulatorId) {
			throw new Error('Manipulator ID is required');
		}

		return await this.sendMessageWithResponse({
			type: 'getManipulatorInfo',
			manipulatorId: manipulatorId
		});
	}

	/**
	 * Get available actions for a manipulator
	 * @param {string} manipulatorId - Manipulator ID
	 * @returns {Promise<Array>}
	 */
	async getManipulatorActions(manipulatorId) {
		if (!manipulatorId) {
			throw new Error('Manipulator ID is required');
		}

		const response = await this.sendMessageWithResponse({
			type: 'getManipulatorActions',
			manipulatorId: manipulatorId
		});

		return response.actions || [];
	}

	/**
	 * Add a new manipulator to the pipeline
	 * @param {string} type - Manipulator type
	 * @param {Object} config - Configuration options
	 * @param {number} position - Position in pipeline (optional)
	 * @returns {Promise<Object>}
	 */
	async addManipulator(type, config = {}, position = null) {
		if (!type) {
			throw new Error('Manipulator type is required');
		}

		const message = {
			type: 'addManipulator',
			manipulatorType: type,
			config: config
		};

		if (typeof position === 'number') {
			message.position = position;
		}

		const result = await this.sendMessageWithResponse(message);
		this._invalidateCache('manipulators');
		this.emit('manipulatorAdded', result);
		return result;
	}

	/**
	 * Remove a manipulator from the pipeline
	 * @param {string} manipulatorId - Manipulator ID
	 * @returns {Promise<Object>}
	 */
	async removeManipulator(manipulatorId) {
		if (!manipulatorId) {
			throw new Error('Manipulator ID is required');
		}

		const result = await this.sendMessageWithResponse({
			type: 'removeManipulator',
			manipulatorId: manipulatorId
		});

		this._invalidateCache('manipulators');
		this.emit('manipulatorRemoved', result);
		return result;
	}

	/**
	 * Configure a manipulator
	 * @param {string} manipulatorId - Manipulator ID
	 * @param {Object} config - New configuration
	 * @returns {Promise<Object>}
	 */
	async configureManipulator(manipulatorId, config) {
		if (!manipulatorId) {
			throw new Error('Manipulator ID is required');
		}

		const result = await this.sendMessageWithResponse({
			type: 'configureManipulator',
			manipulatorId: manipulatorId,
			config: config
		});

		this.emit('manipulatorConfigured', result);
		return result;
	}

	/**
	 * Move a manipulator to a different position
	 * @param {string} manipulatorId - Manipulator ID
	 * @param {number|string} target - New position number or 'up'/'down'
	 * @returns {Promise<Object>}
	 */
	async moveManipulator(manipulatorId, target) {
		if (!manipulatorId) {
			throw new Error('Manipulator ID is required');
		}

		const message = {
			type: 'moveManipulator',
			manipulatorId: manipulatorId
		};

		if (typeof target === 'number') {
			message.newPosition = target;
		} else if (target === 'up' || target === 'down') {
			message.direction = target;
		} else {
			throw new Error('Target must be a position number or "up"/"down"');
		}

		const result = await this.sendMessageWithResponse(message);
		this._invalidateCache('manipulators');
		this.emit('manipulatorMoved', result);
		return result;
	}

	/**
	 * Execute an action on a manipulator
	 * @param {string} manipulatorId - Manipulator ID
	 * @param {string} actionName - Action to execute
	 * @param {Object} params - Action parameters
	 * @returns {Promise<Object>}
	 */
	async executeAction(manipulatorId, actionName, params = {}) {
		if (!manipulatorId || !actionName) {
			throw new Error('Manipulator ID and action name are required');
		}

		const result = await this.sendMessageWithResponse({
			type: 'executeAction',
			manipulatorId: manipulatorId,
			actionName: actionName,
			params: JSON.stringify(params)
		});

		this.emit('actionExecuted', { manipulatorId, actionName, params, result });
		return result;
	}

	// ==================== PIPELINE MANAGEMENT ====================

	/**
	 * Get available manipulator types
	 * @param {boolean} useCache - Whether to use cached data
	 * @returns {Promise<Array>}
	 */
	async getAvailableTypes(useCache = true) {
		if (useCache && this._isCacheValid('availableTypes')) {
			return this.cache.availableTypes;
		}

		const status = await this.getSystemStatus(useCache);
		this.cache.availableTypes = status.availableManipulatorTypes || [];
		return this.cache.availableTypes;
	}

	/**
	 * Load a complete pipeline configuration
	 * @param {Array} config - Pipeline configuration
	 * @returns {Promise<Object>}
	 */
	async loadPipelineConfig(config) {
		if (!Array.isArray(config)) {
			throw new Error('Pipeline config must be an array');
		}

		const result = await this.sendMessageWithResponse({
			type: 'loadPipelineConfig',
			config: config
		});

		this._clearCache();
		this.emit('pipelineLoaded', result);
		return result;
	}

	/**
	 * Save current pipeline configuration
	 * @returns {Promise<Object>}
	 */
	async savePipelineConfig() {
		const result = await this.sendMessageWithResponse({
			type: 'savePipelineConfig'
		});

		this.emit('pipelineSaved', result);
		return result;
	}

	/**
	 * Clear the entire pipeline
	 * @returns {Promise<Array>}
	 */
	async clearPipeline() {
		const manipulators = await this.getManipulators(false);
		const results = [];

		for (const manipulator of manipulators) {
			try {
				const result = await this.removeManipulator(manipulator.id);
				results.push({ success: true, id: manipulator.id, result });
			} catch (error) {
				results.push({ success: false, id: manipulator.id, error: error.message });
			}
		}

		this._clearCache();
		this.emit('pipelineCleared', results);
		return results;
	}

	/**
	 * Execute multiple operations in sequence
	 * @param {Array} operations - Array of operations to execute
	 * @returns {Promise<Object>}
	 */
	async bulkExecute(operations) {
		if (!Array.isArray(operations)) {
			throw new Error('Operations must be an array');
		}

		const result = await this.sendMessageWithResponse({
			type: 'bulkExecute',
			operations: operations
		});

		this._invalidateCache('manipulators');
		this.emit('bulkExecuted', result);
		return result;
	}

	// ==================== CONVENIENCE METHODS ====================

	/**
	 * Find manipulators by type
	 * @param {string} type - Manipulator type to find
	 * @returns {Promise<Array>}
	 */
	async findManipulatorsByType(type) {
		const manipulators = await this.getManipulators();
		return manipulators.filter(m => m.type === type);
	}

	/**
	 * Find manipulator by title or display name
	 * @param {string} name - Name to search for
	 * @returns {Promise<Object|null>}
	 */
	async findManipulatorByName(name) {
		const manipulators = await this.getManipulators();
		return manipulators.find(m =>
			m.title?.includes(name) ||
			m.displayName?.includes(name)
		) || null;
	}

	/**
	 * Get manipulator by ID
	 * @param {string} id - Manipulator ID
	 * @returns {Promise<Object|null>}
	 */
	async getManipulatorById(id) {
		const manipulators = await this.getManipulators();
		return manipulators.find(m => m.id === id) || null;
	}

	/**
	 * Execute action on manipulator by name
	 * @param {string} name - Manipulator name
	 * @param {string} actionName - Action to execute
	 * @param {Object} params - Action parameters
	 * @returns {Promise<Object>}
	 */
	async executeActionByName(name, actionName, params = {}) {
		const manipulator = await this.findManipulatorByName(name);
		if (!manipulator) {
			throw new Error(`Manipulator not found: ${name}`);
		}
		return await this.executeAction(manipulator.id, actionName, params);
	}

	/**
	 * Clone an existing manipulator
	 * @param {string} sourceId - Source manipulator ID
	 * @param {Object} configOverrides - Configuration overrides
	 * @returns {Promise<Object>}
	 */
	async cloneManipulator(sourceId, configOverrides = {}) {
		const sourceInfo = await this.getManipulatorInfo(sourceId);
		const newConfig = { ...sourceInfo.config, ...configOverrides };

		return await this.addManipulator(sourceInfo.type, newConfig);
	}

	// ==================== EVENT SYSTEM ====================

	/**
	 * Add event listener
	 * @param {string} event - Event name
	 * @param {Function} callback - Callback function
	 */
	on(event, callback) {
		if (!this.eventListeners.has(event)) {
			this.eventListeners.set(event, []);
		}
		this.eventListeners.get(event).push(callback);
	}

	/**
	 * Remove event listener
	 * @param {string} event - Event name
	 * @param {Function} callback - Callback function
	 */
	off(event, callback) {
		if (!this.eventListeners.has(event)) return;

		const listeners = this.eventListeners.get(event);
		const index = listeners.indexOf(callback);
		if (index > -1) {
			listeners.splice(index, 1);
		}
	}

	/**
	 * Emit event
	 * @param {string} event - Event name
	 * @param {*} data - Event data
	 */
	emit(event, data) {
		if (!this.eventListeners.has(event)) return;

		this.eventListeners.get(event).forEach(callback => {
			try {
				callback(data);
			} catch (error) {
				console.error(`Error in event listener for ${event}:`, error);
			}
		});
	}

	// ==================== UTILITY METHODS ====================

	/**
	 * Get connection information
	 * @returns {Object}
	 */
	getConnectionInfo() {
		return {
			isConnected: this.isConnected,
			currentRoom: this.currentRoom,
			connectionMethod: this.connectionMethod,
			stats: { ...this.stats },
			uptime: this.stats.connectedAt ? Date.now() - this.stats.connectedAt : 0
		};
	}

	/**
	 * Get detailed statistics
	 * @returns {Object}
	 */
	getStatistics() {
		return {
			connection: this.getConnectionInfo(),
			cache: {
				size: Object.keys(this.cache).filter(k => k !== 'lastUpdate').length,
				lastUpdate: this.cache.lastUpdate,
				isValid: this._isCacheValid()
			},
			pendingRequests: this.pendingRequests.size,
			eventListeners: Object.fromEntries(
				Array.from(this.eventListeners.entries()).map(([k, v]) => [k, v.length])
			)
		};
	}

	/**
	 * Wait for connection to be established
	 * @param {number} timeout - Timeout in milliseconds
	 * @returns {Promise<void>}
	 */
	async waitForConnection(timeout = 10000) {
		if (this.isConnected) return;

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.off('connected', onConnect);
				reject(new Error('Connection timeout'));
			}, timeout);

			const onConnect = () => {
				clearTimeout(timer);
				this.off('connected', onConnect);
				resolve();
			};

			this.on('connected', onConnect);
		});
	}

	// ==================== PRIVATE METHODS ====================

	/**
	 * Connect via browser messaging
	 * @private
	 */
	_connectBrowser() {
		return new Promise((resolve, reject) => {
			try {
				const channelName = `swicc_control_${this.currentRoom}`;
				this.broadcastChannel = new BroadcastChannel(channelName);

				this.broadcastChannel.onmessage = (event) => {
					this._handleMessage(event.data);
				};

				this.broadcastChannel.onerror = (error) => {
					this.onError(`Browser channel error: ${error}`);
				};

				this.isConnected = true;
				this.onConnect(`Connected to browser channel: ${channelName}`);
				this.emit('connected', { method: 'browser', channel: channelName });
				resolve();

			} catch (error) {
				this.onError(`Browser connection error: ${error.message}`);
				reject(error);
			}
		});
	}

	/**
	 * Connect via WebSocket
	 * @private
	 */
	_connectWebSocket() {
		return new Promise((resolve, reject) => {
			try {
				this.websocket = new WebSocket(this.wsUrl);

				this.websocket.onopen = () => {
					this.websocket.send("+join " + this.currentRoom);
					this.isConnected = true;
					this.reconnectAttempts = 0;
					this.onConnect(`WebSocket connected to room: ${this.currentRoom}`);
					this.emit('connected', { method: 'websocket', room: this.currentRoom });
					resolve();
				};

				this.websocket.onmessage = (event) => {
					try {
						const data = JSON.parse(event.data);
						this._handleMessage(data);
					} catch (error) {
						this.onError(`Failed to parse message: ${error.message}`);
					}
				};

				this.websocket.onclose = (event) => {
					this.isConnected = false;
					this.onDisconnect(`WebSocket closed: ${event.code} ${event.reason || 'No reason'}`);
					this.emit('disconnected', { code: event.code, reason: event.reason });

					if (this.autoReconnect && event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
						this._scheduleReconnect();
					}
				};

				this.websocket.onerror = (error) => {
					this.onError(`WebSocket error: ${error}`);
					this.isConnected = false;
					this.emit('error', error);
					reject(error);
				};

			} catch (error) {
				this.onError(`WebSocket connection error: ${error.message}`);
				reject(error);
			}
		});
	}

	/**
	 * Handle incoming messages
	 * @private
	 */
	_handleMessage(data) {
		this.stats.messagesReceived++;
		this.emit('messageReceived', data);

		// Handle response messages
		if (data.type === 'response' && data.responseId) {
			const responseHandler = this.pendingRequests.get(data.responseId);
			if (responseHandler) {
				this.pendingRequests.delete(data.responseId);
				clearTimeout(responseHandler.timeout);
				responseHandler.resolve(data.result);
				return;
			}
		}

		// Handle regular messages
		this.onMessage(data);
	}

	/**
	 * Generate unique request ID
	 * @private
	 */
	_generateRequestId() {
		return `req_${this.nextRequestId++}_${Date.now()}`;
	}

	/**
	 * Create promise for response handling
	 * @private
	 */
	_createResponsePromise(requestId) {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.pendingRequests.delete(requestId);
				reject(new Error(`Request timeout: ${requestId}`));
			}, this.requestTimeout);

			this.pendingRequests.set(requestId, {
				resolve,
				reject,
				timeout,
				timestamp: Date.now()
			});
		});
	}

	/**
	 * Schedule reconnection attempt
	 * @private
	 */
	_scheduleReconnect() {
		this._clearReconnectTimer();

		this.reconnectAttempts++;
		const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

		this.reconnectTimer = setTimeout(() => {
			if (this.reconnectAttempts <= this.maxReconnectAttempts) {
				this._connectWebSocket().catch(() => {
					// Reconnection failed, will try again if under limit
				});
			}
		}, delay);
	}

	/**
	 * Clear reconnection timer
	 * @private
	 */
	_clearReconnectTimer() {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
	}

	/**
	 * Check if cache is valid
	 * @private
	 */
	_isCacheValid(key = null) {
		if (!this.cache.lastUpdate) return false;

		const isExpired = Date.now() - this.cache.lastUpdate > this.cacheTimeout;
		if (isExpired) return false;

		if (key) {
			return this.cache[key] !== null;
		}

		return true;
	}

	/**
	 * Invalidate cache
	 * @private
	 */
	_invalidateCache(key = null) {
		if (key) {
			this.cache[key] = null;
		} else {
			this._clearCache();
		}
	}

	/**
	 * Clear all cache
	 * @private
	 */
	_clearCache() {
		this.cache = {
			status: null,
			manipulators: null,
			availableTypes: null,
			lastUpdate: null
		};
	}

	// ==================== DEFAULT EVENT HANDLERS ====================

	_defaultMessageHandler(message) {
		console.log('GLaMS message received:', message);
	}

	_defaultConnectHandler(info) {
		console.log('GLaMS connected:', info);
	}

	_defaultDisconnectHandler(reason) {
		console.log('GLaMS disconnected:', reason);
	}

	_defaultErrorHandler(error) {
		console.error('GLaMS Controller Error:', error);
	}

	_defaultStatusHandler(status) {
		console.log('GLaMS status update:', status);
	}

	/**
	 * Dispose of the controller and clean up resources
	 */
	dispose() {
		this.disconnect();
		this.eventListeners.clear();
		this.pendingRequests.clear();
		this._clearCache();
	}
}