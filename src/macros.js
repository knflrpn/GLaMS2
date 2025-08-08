/**
 * /src/macros.js
 * 
 * Main application class that coordinates all components.
 */

import { GamepadSource } from './sources/GamepadSource.js';
import { SwiCCSink } from './core/SwiCCSink.js';
import { UIManager } from './macros/UIManager.js';
import { PlaybackManager } from './macros/PlaybackManager.js';
import { MacroParser } from './macros/MacroParser.js';

export class MacrosInterface {
	constructor() {
		// Initialize core components
		this.gamepadSource = new GamepadSource(0);
		this.swiccSink = null;
		this.ui = new UIManager();
		this.playbackManager = null;

		this.initializeApplication();
	}

	/**
	 * Initialize the application and set up all components.
	 */
	initializeApplication() {
		// Set up UI event handlers
		this.setupUIEventHandlers();

		// Initialize UI components
		this.ui.initializeButtonGrid();

		// Start gamepad monitoring
		this.startGamepadMonitoring();

		// Initialize macro info display
		this.updateMacroInfo();

		this.ui.logMessage('Application initialized');
	}

	/**
	 * Set up all UI event handlers.
	 */
	setupUIEventHandlers() {
		this.ui.onEvent('connectSwiCC', () => this.connectSwiCC());
		this.ui.onEvent('disconnectSwiCC', () => this.disconnectSwiCC());
		this.ui.onEvent('useVsync', () => this.useVsync());
		this.ui.onEvent('playMacro', () => this.playMacro());
		this.ui.onEvent('stopAllPlayback', () => this.stopAllPlayback());
		this.ui.onEvent('validateMacro', () => this.validateMacro());
		this.ui.onEvent('loadExample', () => this.loadExample());
		this.ui.onEvent('clearMacro', () => this.clearMacro());
		this.ui.onEvent('updateMacroInfo', () => this.updateMacroInfo());
	}

	/**
	 * Set up playback manager with callbacks.
	 */
	setupPlaybackManager() {
		this.playbackManager = new PlaybackManager(
			this.gamepadSource,
			this.swiccSink,
			(msg) => this.ui.logMessage(msg)
		);

		this.playbackManager.setCallbacks({
			onStatusChange: (status) => this.ui.updateStatus(status),
			onMacroProgress: (current, total) => this.ui.updateMacroProgress(current, total),
			onMacroComplete: () => this.handleMacroComplete(),
			onError: (message) => this.ui.logMessage(message, 'error')
		});
	}

	/**
	 * Connect to SwiCC device.
	 */
	async connectSwiCC() {
		try {
			this.ui.logMessage('Attempting to connect to SwiCC device...');

			this.swiccSink = new SwiCCSink({
				onDisconnect: () => this.handleSwiCCDisconnect(),
				onMessage: (msg) => this.handleSwiCCMessage(msg),
				logMessage: (msg) => this.ui.logMessage(`[SwiCC] ${msg}`)
			});

			await this.swiccSink.connect();

			this.ui.updateSwiCCStatus(true);
			// Periodically update SwiCC status
			this.statusinterval = setInterval(() => {
				if (!this.swiccSink) clearInterval(this.statusinterval);
				else
				this.ui.updateDeviceInfo(
					this.swiccSink.deviceId || '-',
					this.swiccSink.deviceVersion || '-',
					this.swiccSink.queueSize || '-',
					this.swiccSink.queueRemaining || '-'
				);
			}, 250);

			// Initialize playback manager now that we have a connection
			this.setupPlaybackManager();
			this.startGamepadPassthrough();

			this.updatePlaybackButtons();
			this.ui.logMessage('Successfully connected to SwiCC device');

		} catch (error) {
			this.ui.logMessage(`Failed to connect to SwiCC: ${error.message}`, 'error');
			this.ui.updateSwiCCStatus(false);
		}
	}

	/**
	 * Disconnect from SwiCC device.
	 */
	async disconnectSwiCC() {
		if (this.swiccSink && this.swiccSink.isConnected) {
			if (this.playbackManager) {
				await this.playbackManager.stopAllPlayback();
			}
			await this.swiccSink.disconnect();
			this.ui.logMessage('Disconnected from SwiCC device');
		}

		this.swiccSink = null;
		this.playbackManager = null;
		this.ui.updateSwiCCStatus(false);
		this.updatePlaybackButtons();
	}

	/**
	 * Configure VSYNC on the SwiCC device.
	 */
	async useVsync() {
		if (!this.swiccSink || !this.swiccSink.isConnected) {
			this.ui.logMessage('Cannot configure VSYNC: SwiCC not connected', 'error');
			return;
		}

		try {
			const delay = this.ui.getVsyncDelay();

			// Validate delay range (0-65535 for 16-bit value)
			if (delay < 0 || delay > 65535) {
				this.ui.logMessage('VSYNC delay must be between 0 and 65535 µs', 'error');
				return;
			}

			// Send VSYNC enable command
			await this.swiccSink.sendMessage('+VSYNC 1');
			this.ui.logMessage('VSYNC enabled');

			// Send VSYNC delay command (convert to 4-digit hex)
			const hexDelay = delay.toString(16).toUpperCase().padStart(4, '0');
			await this.swiccSink.sendMessage(`+VSD ${hexDelay}`);
			this.ui.logMessage(`VSYNC delay set to ${delay} µs (0x${hexDelay})`);

		} catch (error) {
			this.ui.logMessage(`Failed to configure VSYNC: ${error.message}`, 'error');
		}
	}
	
	/**
	 * Start gamepad passthrough.
	 */
	async startGamepadPassthrough() {
		if (this.playbackManager) {
			const success = await this.playbackManager.startGamepadPassthrough();
			if (success) {
				this.updatePlaybackButtons();
			}
		}
	}

	/**
	 * Play macro script.
	 */
	async playMacro() {
		if (!this.playbackManager) return;

		try {
			const script = this.ui.getMacroScript();
			const macroFrames = MacroParser.parseScript(script);

			const success = await this.playbackManager.startMacroPlayback(macroFrames);
			if (success) {
				this.updatePlaybackButtons();
			}
		} catch (error) {
			this.ui.logMessage(`Failed to parse macro script: ${error.message}`, 'error');
		}
	}

	/**
	 * Stop all playback operations.
	 */
	async stopAllPlayback() {
		if (this.playbackManager) {
			await this.playbackManager.stopAllPlayback();
			this.ui.updateMacroProgress(0, 0);
			this.updatePlaybackButtons();
		}
	}

	/**
	 * Validate the macro script.
	 */
	validateMacro() {
		try {
			const script = this.ui.getMacroScript();
			const frames = MacroParser.parseScript(script);
			this.ui.logMessage(`Macro validation successful: ${frames.length} frames`, 'success');
			this.updateMacroInfo();
			this.updatePlaybackButtons();
		} catch (error) {
			this.ui.logMessage(`Macro validation failed: ${error.message}`, 'error');
		}
	}

	/**
	 * Load example macro script.
	 */
	loadExample() {
		const example = MacroParser.getExampleScript();
		this.ui.setMacroScript(example);
		this.updateMacroInfo();
		this.updatePlaybackButtons();
		this.ui.logMessage('Loaded example macro');
	}

	/**
	 * Clear the macro script.
	 */
	clearMacro() {
		this.ui.clearMacroScript();
		this.updateMacroInfo();
		this.updatePlaybackButtons();
		this.ui.logMessage('Cleared macro script');
	}

	/**
	 * Update macro information display.
	 */
	updateMacroInfo() {
		const script = this.ui.getMacroScript();
		const lines = script.split('\n').filter(line => line.trim().length > 0);
		const duration = lines.length / 60; // 60 FPS

		this.ui.updateMacroInfo(lines.length, duration);
		this.updatePlaybackButtons();
	}

	/**
	 * Update playback button states.
	 */
	updatePlaybackButtons() {
		const playbackState = this.playbackManager ? this.playbackManager.getState() : {
			gamepadPassthroughActive: false,
			macroPlaybackActive: false
		};

		const script = this.ui.getMacroScript().trim();

		this.ui.updatePlaybackButtons({
			isConnected: this.swiccSink?.isConnected || false,
			gamepadPassthroughActive: playbackState.gamepadPassthroughActive,
			macroPlaybackActive: playbackState.macroPlaybackActive,
			hasMacroScript: script.length > 0
		});
	}

	/**
	 * Start monitoring gamepad input for display updates.
	 */
	startGamepadMonitoring() {
		const updateGamepad = () => {
			const gamepadData = this.gamepadSource.getState();

			if (gamepadData && gamepadData.index >= 0) {
				// Get gamepad name
				const gamepads = navigator.getGamepads();
				const activeGamepad = gamepads[0];
				const gamepadName = activeGamepad ? (activeGamepad.id || 'Unknown Gamepad') : '';

				this.ui.updateGamepadDisplay(gamepadData.state, gamepadName);
				this.ui.updateGamepadStatus(true);
			} else {
				this.ui.updateGamepadStatus(false);
			}

			requestAnimationFrame(updateGamepad);
		};

		updateGamepad();
	}

	/**
	 * Handle SwiCC disconnection.
	 */
	handleSwiCCDisconnect() {
		this.ui.logMessage('SwiCC device disconnected', 'error');
		this.ui.updateSwiCCStatus(false);
		this.swiccSink = null;
		this.playbackManager = null;
		this.updatePlaybackButtons();
	}

	/**
	 * Handle SwiCC messages.
	 * @param {string} message - Message from SwiCC
	 */
	handleSwiCCMessage(message) {
		this.ui.logMessage(`[SwiCC] ${message}`);

		// Update queue status display when we receive updates
		if (this.swiccSink) {
			this.ui.updateDeviceInfo(
				this.swiccSink.deviceId || '-',
				this.swiccSink.deviceVersion || '-',
				this.swiccSink.queueSize,
				this.swiccSink.queueRemaining
			);
		}
	}

	/**
	 * Handle macro completion.
	 */
	handleMacroComplete() {
		this.ui.setMacroProgressComplete();
		this.updatePlaybackButtons();
		this.ui.logMessage('Macro playback completed');
	}
}