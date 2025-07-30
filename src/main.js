// ./src/main.js (Refactored)

// Import core engine components
import { ControllerState } from './core/ControllerState.js';
import { GamepadSource } from './sources/GamepadSource.js';
import { Engine } from './core/Engine.js';
import { ActionMessageHandler } from './core/ActionMessageHandler.js';

// Import managers
import { UIManager } from './core/UIManager.js';
import { ConnectionManager } from './core/ConnectionManager.js';
import { ConfigurationManager } from './core/ConfigurationManager.js';
import { PipelineManager } from './core/PipelineManager.js';
import { BroadcastManager } from './core/BroadcastManager.js';
import { ExternalControlManager } from './core/ExternalControlManager.js';

/**
 * SwiCCApplication - Main application controller
 * Coordinates all managers and handles application lifecycle
 */
class SwiCCApplication {
	constructor() {
		// Core components
		this.engine = null;
		this.pipeline = null;
		this.gamepadSource = null;
		this.messageHandler = null;

		// Managers
		this.managers = {};

		// Monitoring
		this.gamepadMonitorInterval = null;
		this.gamepadCache = this.createGamepadCache();
	}

	/**
	 * Initialize the application
	 */
	async init() {
		try {
			this.createCoreComponents();
			this.createManagers();
			this.setupManagerIntegration();
			this.initializeDefaultConfiguration();
			this.startMonitoring();

			// Export debug interface
			this.setupDebugInterface();

			this.managers.ui.logMessage('System initialized successfully');
			this.managers.ui.logMessage('Ready to connect');

		} catch (error) {
			console.error('Failed to initialize application:', error);
			if (this.managers.ui) {
				this.managers.ui.logMessage(`Initialization error: ${error.message}`);
			}
		}
	}

	/**
	 * Create core engine components
	 */
	createCoreComponents() {
		// Create engine with unified pipeline
		this.engine = new Engine({ frameRate: 60 });
		this.pipeline = this.engine.getPipeline();

		// Create message handler
		this.messageHandler = new ActionMessageHandler(this.pipeline);

		// Add static gamepad source
		this.gamepadSource = new GamepadSource(0);
		this.engine.addSource('gamepad0', this.gamepadSource);

		this.managers.ui?.logMessage('Core components created');
	}

	/**
	 * Create all managers
	 */
	createManagers() {
		// Create managers in dependency order
		this.managers.ui = new UIManager(this.engine);
		this.managers.connection = new ConnectionManager(this.engine, this.managers.ui);
		this.managers.pipeline = new PipelineManager(this.pipeline, this.managers.ui);
		this.managers.broadcast = new BroadcastManager(this.pipeline, this.managers.ui);
		this.managers.config = new ConfigurationManager(this.pipeline, this.managers.ui);
		this.managers.external = new ExternalControlManager(this.pipeline, this.managers.ui);

		this.managers.ui.logMessage('All managers created');
	}

	/**
	 * Setup integration between managers
	 */
	setupManagerIntegration() {
		// Connect ConfigurationManager to PipelineManager
		this.managers.config.setCallbacks({
			onLoadPipeline: (config) => this.managers.pipeline.loadConfig(config),
			onLoadBroadcast: (config) => this.managers.broadcast.loadConfig(config),
			onGetPipelineConfig: () => this.managers.pipeline.getCurrentConfig(),
			onClearPipeline: () => this.managers.pipeline.clearPipeline()
		});

		// Connect PipelineManager to BroadcastManager
		this.managers.pipeline.onPipelineChange(() => {
			this.managers.broadcast.updateSnapshotIndicators();
			this.managers.broadcast.updatePositionConstraints();
		});

		// Connect ExternalControlManager to PipelineManager
		this.managers.external.setPipelineManager(this.managers.pipeline);

		// Additional integrations can be added here
		this.managers.ui.logMessage('Manager integration completed');
	}

	/**
	 * Initialize default configuration and UI
	 */
	initializeDefaultConfiguration() {
		// Initialize all manager UIs
		this.managers.connection.initializeUI();
		this.managers.config.initializeUI();
		this.managers.external.initialize();

		// Load default pipeline preset
		this.loadPipelinePreset('default');

		this.managers.ui.logMessage('Default configuration loaded');
	}

	/**
	 * Load a pipeline preset
	 * @param {string} presetName - Name of the preset to load
	 */
	loadPipelinePreset(presetName) {
		const presets = {
			default: {
				name: 'Default',
				description: 'Passthrough with controller display',
				pipeline: [],
			},
			ChatControl: {
				name: 'Chat Control',
				description: 'Display and Chat control',
				pipeline: [
					{ type: 'ChatCommand', config: {} }
				]
			}
		};

		const preset = presets[presetName];
		if (!preset) {
			this.managers.ui.logMessage(`Preset '${presetName}' not found`);
			return;
		}

		try {
			this.managers.pipeline.loadConfig(preset.pipeline);
			this.managers.ui.logMessage(`Loaded preset: ${preset.name} - ${preset.description}`);
		} catch (error) {
			this.managers.ui.logMessage(`Error loading preset: ${error.message}`);
		}
	}

	/**
	 * Start monitoring gamepad status
	 */
	startMonitoring() {
		// Start gamepad monitoring at 100ms intervals
		this.gamepadMonitorInterval = setInterval(() => {
			this.updateGamepadStatus();
		}, 100);

		this.managers.ui.logMessage('Monitoring started');
	}

	/**
	 * Stop monitoring
	 */
	stopMonitoring() {
		if (this.gamepadMonitorInterval) {
			clearInterval(this.gamepadMonitorInterval);
			this.gamepadMonitorInterval = null;
		}
	}

	/**
	 * Create gamepad state cache for efficient updates
	 */
	createGamepadCache() {
		return {
			connected: false,
			id: null,
			buttons: [],
			axes: []
		};
	}

	/**
	 * Update gamepad status with caching for performance
	 */
	updateGamepadStatus() {
		const gamepads = navigator.getGamepads();
		const gamepad = gamepads[0];

		if (gamepad) {
			const gamepadData = this.processGamepadData(gamepad);

			// Only update UI if data has changed
			if (this.hasGamepadDataChanged(gamepadData)) {
				this.managers.ui.updateGamepadStatus(gamepadData);
				this.updateGamepadCache(gamepadData);
			}
		} else {
			// Handle disconnection
			if (this.gamepadCache.connected) {
				this.managers.ui.updateGamepadStatus({ connected: false });
				this.resetGamepadCache();
			}
		}
	}

	/**
	 * Process raw gamepad data into structured format
	 * @param {Gamepad} gamepad - Raw gamepad object
	 * @returns {Object} Processed gamepad data
	 */
	processGamepadData(gamepad) {
		const buttonMap = {
			'A': 1, 'B': 0, 'X': 3, 'Y': 2,
			'L': 4, 'R': 5, 'ZL': 6, 'ZR': 7,
			'−': 8, '+': 9, 'h': 16, 'c': 17,
			'↑': 12, '↓': 13, '←': 14, '→': 15
		};

		// Process buttons
		const buttons = {};
		Object.entries(buttonMap).forEach(([label, idx]) => {
			buttons[label] = !!(gamepad.buttons[idx] && gamepad.buttons[idx].pressed);
		});

		// Process axes with precision rounding
		const axes = [
			+(gamepad.axes[0] || 0).toFixed(2),
			+(gamepad.axes[1] || 0).toFixed(2),
			+(gamepad.axes[2] || 0).toFixed(2),
			+(gamepad.axes[3] || 0).toFixed(2)
		];

		return {
			connected: true,
			id: gamepad.id,
			buttons: buttons,
			axes: axes
		};
	}

	/**
	 * Check if gamepad data has changed since last update
	 * @param {Object} newData - New gamepad data
	 * @returns {boolean} True if data has changed
	 */
	hasGamepadDataChanged(newData) {
		const cache = this.gamepadCache;

		// Check connection status and ID
		if (cache.connected !== newData.connected || cache.id !== newData.id) {
			return true;
		}

		// Check buttons
		if (!this.arraysEqual(Object.values(cache.buttons), Object.values(newData.buttons))) {
			return true;
		}

		// Check axes
		if (!this.arraysEqual(cache.axes, newData.axes)) {
			return true;
		}

		return false;
	}

	/**
	 * Update gamepad cache with new data
	 * @param {Object} newData - New gamepad data
	 */
	updateGamepadCache(newData) {
		this.gamepadCache.connected = newData.connected;
		this.gamepadCache.id = newData.id;
		this.gamepadCache.buttons = { ...newData.buttons };
		this.gamepadCache.axes = [...newData.axes];
	}

	/**
	 * Reset gamepad cache to disconnected state
	 */
	resetGamepadCache() {
		this.gamepadCache.connected = false;
		this.gamepadCache.id = null;
		this.gamepadCache.buttons = {};
		this.gamepadCache.axes = [];
	}

	/**
	 * Utility function for shallow array comparison
	 * @param {Array} a - First array
	 * @param {Array} b - Second array
	 * @returns {boolean} True if arrays are equal
	 */
	arraysEqual(a, b) {
		return a.length === b.length && a.every((v, i) => v === b[i]);
	}

	/**
	 * Execute action on a manipulator (exposed for external use)
	 * @param {string} manipulatorId - Manipulator ID
	 * @param {string} actionName - Action name
	 * @param {Object} params - Action parameters
	 * @returns {*} Action result
	 */
	async executeManipulatorAction(manipulatorId, actionName, params) {
		return this.managers.pipeline.executeAction(manipulatorId, actionName, params);
	}

	/**
	 * Get application statistics for monitoring
	 * @returns {Object} Application statistics
	 */
	getApplicationStats() {
		return {
			engine: {
				running: this.engine ? this.engine.isRunning() : false,
				frameRate: 60
			},
			connections: this.managers.connection.getConnectionStats(),
			pipeline: this.managers.pipeline.getStatistics(),
			broadcast: this.managers.broadcast.getStatistics(),
			config: this.managers.config.getStatistics(),
			external: this.managers.external.getStatistics(),
			gamepad: {
				connected: this.gamepadCache.connected,
				id: this.gamepadCache.id
			}
		};
	}

	/**
	 * Setup debug interface for development
	 */
	setupDebugInterface() {
		window.swiccDebug = {
			// Core components
			app: this,
			engine: this.engine,
			pipeline: this.pipeline,
			messageHandler: this.messageHandler,
			gamepadSource: this.gamepadSource,

			// Managers
			managers: this.managers,

			// Utility functions
			addManipulator: (type, config) => this.managers.pipeline.addManipulator(type, config),
			loadPreset: (name) => this.loadPipelinePreset(name),
			executeAction: (id, action, params) => this.executeManipulatorAction(id, action, params),
			getStats: () => this.getApplicationStats(),

			// Configuration functions
			getCurrentConfig: () => this.managers.pipeline.getCurrentConfig(),
			loadConfig: (config) => this.managers.pipeline.loadConfig(config),
			saveConfig: (name) => this.managers.config.saveConfiguration(),

			// Broadcast functions
			setBroadcastEnabled: (enabled) => this.managers.broadcast.setBroadcastEnabled(enabled),
			openDisplayWindow: () => this.managers.broadcast.openDisplayWindow(),

			// Connection functions
			connectSwiCC: (id) => this.managers.connection.connectToSwiCC(id),
			disconnectSwiCC: (id) => this.managers.connection.disconnectFromSwiCC(id),

			// External control functions
			connectToRoom: (room) => {
				document.getElementById('roomNameInput').value = room;
				this.managers.external.connectToRoom();
			},
			disconnectFromRoom: () => this.managers.external.disconnectFromRoom(),
			sendExternalMessage: (message) => this.managers.external.processMessage(message),

			// Debug utilities
			clearLogs: () => this.managers.ui.elements.messageLog.innerHTML = '',
			logMessage: (msg) => this.managers.ui.logMessage(msg)
		};

		this.managers.ui.logMessage('Debug interface available as window.swiccDebug');
	}

	/**
	 * Gracefully dispose of the application
	 */
	async dispose() {
		try {
			this.stopMonitoring();

			// Dispose managers in reverse order
			await this.managers.external?.dispose();
			await this.managers.broadcast?.dispose();
			await this.managers.config?.dispose();
			await this.managers.pipeline?.dispose();
			await this.managers.connection?.dispose();
			await this.managers.ui?.dispose();

			// Stop engine
			if (this.engine) {
				this.engine.stop();
			}

			// Clear debug interface
			if (window.swiccDebug) {
				delete window.swiccDebug;
			}

			console.log('Application disposed successfully');

		} catch (error) {
			console.error('Error during application disposal:', error);
		}
	}
}

/**
 * Application entry point
 */
function initializeApplication() {
	// Check for Web Serial support
	if (!('serial' in navigator)) {
		console.error('ERROR: Web Serial API not supported. Please use Chrome/Edge.');

		// Show error in UI if possible
		const messageLog = document.getElementById('messageLog');
		if (messageLog) {
			const errorDiv = document.createElement('div');
			errorDiv.className = 'message error';
			errorDiv.innerHTML = `<span class="timestamp">[${new Date().toLocaleTimeString()}]</span>ERROR: Web Serial API not supported. Please use Chrome/Edge.`;
			messageLog.appendChild(errorDiv);
		}
		return;
	}

	// Create and initialize application
	const app = new SwiCCApplication();
	app.init().catch(error => {
		console.error('Application initialization failed:', error);
	});

	// Handle page unload
	window.addEventListener('beforeunload', () => {
		app.dispose();
	});

	// Global error handler
	window.addEventListener('error', (event) => {
		console.error('Global error:', event.error);
		if (app.managers?.ui) {
			app.managers.ui.logMessage(`Global error: ${event.error.message}`);
		}
	});

	// Handle unhandled promise rejections
	window.addEventListener('unhandledrejection', (event) => {
		console.error('Unhandled promise rejection:', event.reason);
		if (app.managers?.ui) {
			app.managers.ui.logMessage(`Promise rejection: ${event.reason}`);
		}
	});
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initializeApplication);
} else {
	initializeApplication();
}