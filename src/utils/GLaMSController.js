// ./src/utils/GLaMSController.js

export class GLaMSController {
	constructor(options = {}) {
		this.broadcastChannel = null;
		this.websocket = null;
		this.isConnected = false;
		this.currentRoom = '';
		this.connectionMethod = 'browser'; // 'browser' or 'websocket'

		// Event callbacks
		this.onMessage = options.onMessage || this._defaultMessageHandler;
		this.onConnect = options.onConnect || this._defaultConnectHandler;
		this.onDisconnect = options.onDisconnect || this._defaultDisconnectHandler;
		this.onError = options.onError || this._defaultErrorHandler;

		// WebSocket URL
		this.wsUrl = options.wsUrl || 'wss://rollsocket.com/GLaMS_control/';
	}

	// Connection methods
	async connect(roomName, method = 'browser') {
		if (!roomName) {
			throw new Error('Room name is required');
		}

		this.currentRoom = roomName;
		this.connectionMethod = method;

		if (method === 'browser') {
			return this._connectBrowser();
		} else if (method === 'websocket') {
			return this._connectWebSocket();
		} else {
			throw new Error('Invalid connection method. Use "browser" or "websocket"');
		}
	}

	disconnect() {
		if (this.broadcastChannel) {
			this.broadcastChannel.close();
			this.broadcastChannel = null;
		}

		if (this.websocket) {
			this.websocket.close(1000, 'Manual disconnect');
			this.websocket = null;
		}

		this.isConnected = false;
		this.onDisconnect('Manual disconnect');
	}

	// Message sending
	sendMessage(message) {
		if (!this.isConnected) {
			throw new Error('Not connected');
		}

		try {
			if (this.connectionMethod === 'browser' && this.broadcastChannel) {
				this.broadcastChannel.postMessage(message);
			} else if (this.connectionMethod === 'websocket' && this.websocket && this.websocket.readyState === WebSocket.OPEN) {
				this.websocket.send(JSON.stringify(message));
			} else {
				throw new Error('No active connection');
			}
		} catch (error) {
			this.onError(`Send error: ${error.message}`);
			throw error;
		}
	}

	// Convenience methods for common GLaMS operations
	ping() {
		return this.sendMessage({ type: 'ping' });
	}

	getStatus() {
		return this.sendMessage({ type: 'getStatus' });
	}

	listManipulators() {
		return this.sendMessage({ type: 'listManipulators' });
	}

	addManipulator(manipulatorType, config = {}) {
		return this.sendMessage({
			type: 'addManipulator',
			manipulatorType: manipulatorType,
			config: config
		});
	}

	removeManipulator(manipulatorId) {
		return this.sendMessage({
			type: 'removeManipulator',
			manipulatorId: manipulatorId
		});
	}

	executeManipulatorAction(manipulatorId, actionName, params = {}) {
		return this.sendMessage({
			type: 'executeManipulatorAction',
			manipulatorId: manipulatorId,
			actionName: actionName,
			params: JSON.stringify(params)
		});
	}

	// Private connection methods
	_connectBrowser() {
		return new Promise((resolve, reject) => {
			try {
				const channelName = `swicc_control_${this.currentRoom}`;
				this.broadcastChannel = new BroadcastChannel(channelName);

				this.broadcastChannel.onmessage = (event) => {
					this.onMessage(event.data);
				};

				this.broadcastChannel.onerror = (error) => {
					this.onError(`Browser channel error: ${error}`);
				};

				this.isConnected = true;
				this.onConnect(`Connected to browser channel: ${channelName}`);
				resolve();

			} catch (error) {
				this.onError(`Browser connection error: ${error.message}`);
				reject(error);
			}
		});
	}

	_connectWebSocket() {
		return new Promise((resolve, reject) => {
			try {
				this.websocket = new WebSocket(this.wsUrl);

				this.websocket.onopen = () => {
					// Join room
					this.websocket.send("+join " + this.currentRoom );
					this.isConnected = true;
					this.onConnect(`WebSocket connected to room: ${this.currentRoom}`);
					resolve();
				};

				this.websocket.onmessage = (event) => {
					try {
						const data = JSON.parse(event.data);
						this.onMessage(data);
					} catch (error) {
						this.onError(`Failed to parse message: ${error.message}`);
					}
				};

				this.websocket.onclose = (event) => {
					this.isConnected = false;
					this.onDisconnect(`WebSocket closed: ${event.code} ${event.reason || 'No reason'}`);
				};

				this.websocket.onerror = (error) => {
					this.onError(`WebSocket error: ${error}`);
					this.isConnected = false;
					reject(error);
				};

			} catch (error) {
				this.onError(`WebSocket connection error: ${error.message}`);
				reject(error);
			}
		});
	}

	// Default event handlers (can be overridden)
	_defaultMessageHandler(message) {
		console.log('Received message:', message);
	}

	_defaultConnectHandler(info) {
		console.log('Connected:', info);
	}

	_defaultDisconnectHandler(reason) {
		console.log('Disconnected:', reason);
	}

	_defaultErrorHandler(error) {
		console.error('GLaMS Controller Error:', error);
	}

	// Utility methods
	getConnectionInfo() {
		return {
			isConnected: this.isConnected,
			currentRoom: this.currentRoom,
			connectionMethod: this.connectionMethod
		};
	}

	isConnectionActive() {
		if (this.connectionMethod === 'browser') {
			return this.broadcastChannel !== null && this.isConnected;
		} else if (this.connectionMethod === 'websocket') {
			return this.websocket !== null &&
				this.websocket.readyState === WebSocket.OPEN &&
				this.isConnected;
		}
		return false;
	}
}
