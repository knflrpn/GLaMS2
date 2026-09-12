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
		this.ui.onEvent('startRecording', () => this.startRecording());
		this.ui.onEvent('stopRecording', () => this.stopRecording());
		this.ui.onEvent('readRecording', () => this.readRecording());
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

			// Attach recording callbacks
			this.swiccSink.onRecordingData = (hexPayload, rleCount) => this.handleRecordingData(hexPayload, rleCount);
			this.swiccSink.onRecordingStatus = (morePending) => this.handleRecordingStatus(morePending);

			await this.swiccSink.connect();

			// Pre-fetch the recording buffer size
			await this.swiccSink.sendMessage('+GRS ');

			this.ui.updateSwiCCStatus(true);
			
			// Periodically update SwiCC status
			this.statusinterval = setInterval(() => {
				if (!this.swiccSink) {
					clearInterval(this.statusinterval);
					return;
				}
				
				this.ui.updateDeviceInfo(
					this.swiccSink.deviceId || '-',
					this.swiccSink.deviceVersion || '-',
					this.swiccSink.queueSize || '-',
					this.swiccSink.queueRemaining || '-'
				);

				// Poll recording buffer remaining space if recording is active
				if (this.swiccSink.isRecording) {
					this.swiccSink.sendMessage('+GRR ');
				}

				// Calculate recording buffer usage
				let bufferText = '-';
				if (this.swiccSink.recordSize > 0) {
					const usage = this.swiccSink.recordSize - this.swiccSink.recordRemaining;
					const percent = Math.round((usage / this.swiccSink.recordSize) * 100);
					bufferText = `${percent}% (${usage}/${this.swiccSink.recordSize})`;
				}

				this.ui.updateRecordingUI(
					this.swiccSink.isConnected,
					this.swiccSink.isRecording,
					bufferText,
					this.isReadingRecording || false,
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

	/**
	 * Start a new recording session on the 2wiCC device.
	 */
	async startRecording() {
		if (!this.swiccSink?.isConnected) return;
		this.ui.logMessage('Starting recording...');
		this.recordedFrames = []; // Clear local buffer
		
		// Ensure we have the buffer size before starting
		await this.swiccSink.sendMessage('+GRS '); 
		await this.swiccSink.sendMessage('+REC 1');
	}

	/**
	 * Stop the active recording session.
	 */
	async stopRecording() {
		if (!this.swiccSink?.isConnected) return;
		this.ui.logMessage('Stopping recording...');
		await this.swiccSink.sendMessage('+REC 0');
		// Force one last update to fetch final remaining size
		await this.swiccSink.sendMessage('+GRR '); 
	}

	/**
	 * Request the recording from the 2wiCC.
	 */
	async readRecording() {
		if (!this.swiccSink?.isConnected) return;
		
		this.isReadingRecording = true; // Block UI while fetching
		
		this.ui.logMessage('Fetching recording data from device...');
		this.recordedFrames = []; // Prepare for incoming burst
		await this.swiccSink.sendMessage('+GR 0'); // Start reading from beginning
	}
	
	/**
	 * Handle incoming frame data from the recording burst.
	 */
	handleRecordingData(hexPayload, rleCount) {
		this.recordedFrames.push({ hexPayload, rleCount });
	}

	/**
	 * Handle the end-of-burst signal and trigger continuation or final processing.
	 */
	async handleRecordingStatus(morePending) {
		if (morePending) {
			// Request the next batch
			await this.swiccSink.sendMessage('+GR 1');
		} else {
			this.isReadingRecording = false; // Unblock UI
			this.ui.logMessage(`Recording fetched successfully: ${this.recordedFrames.length} unique frames.`);
			this.processRecordedFrames();
		}
	}

	/**
	 * Convert recorded hex frames to macro text format.
	 */
	processRecordedFrames() {
		let macroOutput = '\n; --- Recorded Macro ---\n';
		
		for (const frame of this.recordedFrames) {
			const hex = frame.hexPayload;
			const bytes = [];
			
			// Parse the 18-character hex string into 9 bytes
			for (let i = 0; i < hex.length; i += 2) {
				bytes.push(parseInt(hex.substring(i, i + 2), 16));
			}

			const [b0, b1, b2, b3, b4, b5, b6, b7, b8] = bytes;
			
			// Decode Buttons
			const activeButtons = [];
			
			// Byte 0
			if (b0 & 0x08) activeButtons.push('A');
			if (b0 & 0x04) activeButtons.push('B');
			if (b0 & 0x02) activeButtons.push('X');
			if (b0 & 0x01) activeButtons.push('Y');
			if (b0 & 0x40) activeButtons.push('R1'); // R
			if (b0 & 0x80) activeButtons.push('R2'); // ZR
			
			// Byte 1
			if (b1 & 0x01) activeButtons.push('-');
			if (b1 & 0x02) activeButtons.push('+');
			if (b1 & 0x04) activeButtons.push('R3'); // ThumbR
			if (b1 & 0x08) activeButtons.push('L3'); // ThumbL
			if (b1 & 0x10) activeButtons.push('h');  // Home
			if (b1 & 0x20) activeButtons.push('c');  // Capture
			
			// Byte 2
			if (b2 & 0x01) activeButtons.push('D');  // DpadDown
			if (b2 & 0x02) activeButtons.push('U');  // DpadUp
			if (b2 & 0x04) activeButtons.push('R');  // DpadRight
			if (b2 & 0x08) activeButtons.push('L');  // DpadLeft
			if (b2 & 0x40) activeButtons.push('L1'); // L
			if (b2 & 0x80) activeButtons.push('L2'); // ZL
			
			const buttonStr = `{${activeButtons.join(' ')}}`;

			// Decode Analog Sticks
			// Rebuild the 12-bit raw values from the 6 analog bytes
			const lxRaw = ((b4 & 0x0F) << 8) | b3;
			const lyRaw = (b5 << 4) | (b4 >> 4);
			const rxRaw = ((b7 & 0x0F) << 8) | b6;
			const ryRaw = (b8 << 4) | (b7 >> 4);

			// Format using the exact 12-bit syntax
			const analogStr = `[[${lxRaw-2048}, ${lyRaw-2048}, ${rxRaw-2048}, ${ryRaw-2048}]]`;

			// Assemble Line (e.g., "{A B} [0.00, -1.00, 0.00, 0.00] 5")
			macroOutput += `${buttonStr} ${analogStr} ${frame.rleCount}\n`;
		}

		// Append to the existing script in the UI
		const currentScript = this.ui.getMacroScript();
		const separator = (currentScript && !currentScript.endsWith('\n')) ? '\n' : '';
		
		this.ui.setMacroScript(currentScript + separator + macroOutput.trim() + '\n');
		this.updateMacroInfo();
		this.ui.logMessage('Appended recorded macro to script editor.', 'success');
	}

}