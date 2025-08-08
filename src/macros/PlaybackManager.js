/**
 * /src/macros/PlaybackManager.js
 * 
 * Manages playback operations including gamepad passthrough and macro execution.
 */

export class PlaybackManager {
	constructor(gamepadSource, swiccSink, logger = console.log) {
		this.gamepadSource = gamepadSource;
		this.swiccSink = swiccSink;
		this.logger = logger;

		// Playback state
		this.gamepadPassthroughActive = false;
		this.macroPlaybackActive = false;
		this.playbackInterval = null;

		// Macro state
		this.macroFrames = [];
		this.currentFrameIndex = 0;
		this.queueCheckInterval = null;
		this.lastQueueCheck = 0;
		this.framesSentSinceQueueCheck = 0;
		this.bufferModeActive = false;
		this.macroCompletionCheckInterval = null;

		// Burst sending configuration
		this.burstSize = 30; // Number of frames to send per burst
		this.bufferThreshold = 0.5; // Send burst when buffer is less than 50% full
		this.burstInProgress = false; // Prevent overlapping bursts
		this.queueCheckInProgress = false; // Prevent overlapping queue checks

		// Event callbacks
		this.onStatusChange = null;
		this.onMacroProgress = null;
		this.onMacroComplete = null;
		this.onError = null;
	}

	/**
	 * Set event callbacks.
	 * @param {Object} callbacks - Event callback functions
	 */
	setCallbacks(callbacks) {
		this.onStatusChange = callbacks.onStatusChange || null;
		this.onMacroProgress = callbacks.onMacroProgress || null;
		this.onMacroComplete = callbacks.onMacroComplete || null;
		this.onError = callbacks.onError || null;
	}

	/**
	 * Start gamepad passthrough mode.
	 * @returns {Promise<boolean>} Success status
	 */
	async startGamepadPassthrough() {
		if (!this.swiccSink?.isConnected) {
			this.triggerError('Cannot start passthrough: SwiCC not connected');
			return false;
		}

		if (this.macroPlaybackActive) {
			this.triggerError('Cannot start passthrough: Macro playback is active');
			return false;
		}

		this.gamepadPassthroughActive = true;

		// Send data at 60Hz
		if (this.playbackInterval) clearInterval(this.playbackInterval);
		this.playbackInterval = setInterval(() => {
			this.sendGamepadData();
		}, 1000 / 60);

		this.triggerStatusChange('Gamepad Passthrough Active');
		this.logger('Started gamepad passthrough');
		return true;
	}

	/**
	 * Start macro playback.
	 * @param {ControllerState[]} macroFrames - Array of controller states to play
	 * @returns {Promise<boolean>} Success status
	 */
	async startMacroPlayback(macroFrames) {
		if (!this.swiccSink?.isConnected) {
			this.triggerError('Cannot play macro: SwiCC not connected');
			return false;
		}

		if (macroFrames.length === 0) {
			this.triggerError('Cannot play macro: Macro script is empty');
			return false;
		}

		try {
			// Pause gamepad passthrough if active
			if (this.gamepadPassthroughActive) {
				this.gamepadPassthroughActive = false;
				this.logger('Pausing gamepad passthrough for macro playback');
			}

			// Enter buffer mode for macro playback
			await this.swiccSink.sendMessage('+SPM BUF ');
			this.bufferModeActive = true;
			this.macroPlaybackActive = true;
			this.macroFrames = macroFrames;
			this.currentFrameIndex = 0;
			this.framesSentSinceQueueCheck = 0;
			this.lastQueueCheck = Date.now();
			this.burstInProgress = false;
			this.queueCheckInProgress = false;

			this.triggerStatusChange('Macro Playback Active');
			this.logger(`Starting macro playback (${this.macroFrames.length} frames)`);

			// Start queue monitoring and burst sending
			this.queueCheckInterval = setInterval(() => {
				this.performPeriodicQueueCheck();
			}, 100); // Regular queue status updates

			// Start macro completion monitoring
			this.macroCompletionCheckInterval = setInterval(() => {
				this.checkMacroCompletion();
			}, 100);

			// Clear the old interval since now using burst sending
			if (this.playbackInterval) {
				clearInterval(this.playbackInterval);
				this.playbackInterval = null;
			}

			// Send initial burst to start the process
			await this.sendMacroBurst();

			return true;
		} catch (error) {
			this.triggerError(`Failed to start macro playback: ${error.message}`);
			return false;
		}
	}

	/**
	 * Stop all playback operations.
	 * @returns {Promise<void>}
	 */
	async stopAllPlayback() {
		// Clear all intervals
		if (this.playbackInterval) {
			clearInterval(this.playbackInterval);
			this.playbackInterval = null;
		}

		if (this.queueCheckInterval) {
			clearInterval(this.queueCheckInterval);
			this.queueCheckInterval = null;
		}

		if (this.macroCompletionCheckInterval) {
			clearInterval(this.macroCompletionCheckInterval);
			this.macroCompletionCheckInterval = null;
		}

		// Exit buffer mode if it was active
		if (this.bufferModeActive && this.swiccSink?.isConnected) {
			try {
				await this.swiccSink.sendMessage('+SPM RT ');
				this.bufferModeActive = false;
			} catch (error) {
				this.logger(`Failed to exit buffer mode: ${error.message}`);
			}
		}

		this.gamepadPassthroughActive = false;
		this.macroPlaybackActive = false;
		this.triggerStatusChange('Stopped');
		this.logger('Stopped all playback');
	}

	/**
	 * Send gamepad data to SwiCC.
	 * @private
	 */
	async sendGamepadData() {
		if (!this.gamepadPassthroughActive || !this.swiccSink?.isConnected) return;

		try {
			const gamepadData = this.gamepadSource.getState();
			if (gamepadData && gamepadData.state) {
				await this.swiccSink.send({ state: gamepadData.state });
			}
		} catch (error) {
			this.triggerError(`Gamepad passthrough error: ${error.message}`);
			this.stopAllPlayback();
		}
	}

	/**
	 * Send a burst of macro frames to SwiCC.
	 * @private
	 */
	async sendMacroBurst() {
		if (!this.macroPlaybackActive || !this.swiccSink?.isConnected || this.burstInProgress) return;

		// Prevent overlapping bursts
		this.burstInProgress = true;

		try {
			let framesSent = 0;
			const maxFramesToSend = Math.min(this.burstSize, this.macroFrames.length - this.currentFrameIndex);

			// Send up to burstSize frames or until frames run out
			while (framesSent < maxFramesToSend && this.currentFrameIndex < this.macroFrames.length) {
				const state = this.macroFrames[this.currentFrameIndex];
				await this.swiccSink.send({ state: state });

				this.currentFrameIndex++;
				framesSent++;
				this.framesSentSinceQueueCheck++;
			}

			if (framesSent > 0) {
				this.logger(`Sent burst of ${framesSent} frames (${this.currentFrameIndex}/${this.macroFrames.length})`);

				// Update progress
				this.triggerMacroProgress(this.currentFrameIndex, this.macroFrames.length);
			}
		} catch (error) {
			this.triggerError(`Macro burst sending error: ${error.message}`);
			this.stopAllPlayback();
		} finally {
			this.burstInProgress = false;
		}
	}

	/**
	 * Perform periodic queue status check.
	 * @private
	 */
	async performPeriodicQueueCheck() {
		if (!this.swiccSink?.isConnected || !this.bufferModeActive || this.queueCheckInProgress) return;

		// Always check queue status periodically (needed for macro completion detection)
		const now = Date.now();
		if (now - this.lastQueueCheck >= 100) {
			this.queueCheckInProgress = true;
			try {
				await this.swiccSink.initiateQueueCheck();
				this.lastQueueCheck = now;
				this.framesSentSinceQueueCheck = 0;

				// After queue status is updated, check if should send a burst
				this.considerSendingBurst();
			} catch (error) {
				this.logger(`Queue check error: ${error.message}`);
			} finally {
				this.queueCheckInProgress = false;
			}
		}
	}

	/**
	 * Check if should send a burst and do so if conditions are met.
	 * @private
	 */
	considerSendingBurst() {
		// Only send burst if macro is active and frames remain
		if (!this.macroPlaybackActive || this.currentFrameIndex >= this.macroFrames.length) return;

		// Calculate buffer fill percentage
		const bufferFillRatio = this.swiccSink.queueSize > 0 ?
			(this.swiccSink.queueSize - this.swiccSink.queueRemaining) / this.swiccSink.queueSize : 0;

		// Send burst if buffer is less than threshold full and no burst is in progress
		if (bufferFillRatio < this.bufferThreshold && !this.burstInProgress) {
			// Don't await this - let it run asynchronously
			this.sendMacroBurst().catch(error => {
				this.logger(`Error in burst sending: ${error.message}`);
			});
		}
	}

	/**
	 * Check if macro playback is complete and handle cleanup.
	 * @private
	 */
	async checkMacroCompletion() {
		if (!this.macroPlaybackActive) return;

		// Check if all frames have been sent
		const allFramesSent = this.currentFrameIndex >= this.macroFrames.length;

		// Check if queue is nearly empty
		const queueNearlyEmpty = (this.swiccSink.queueSize - this.swiccSink.queueRemaining) <= 5;

		if (allFramesSent && queueNearlyEmpty) {
			this.logger('Macro playback completed.');

			// Stop macro playback
			this.macroPlaybackActive = false;

			// Clear intervals
			if (this.queueCheckInterval) {
				clearInterval(this.queueCheckInterval);
				this.queueCheckInterval = null;
			}

			if (this.macroCompletionCheckInterval) {
				clearInterval(this.macroCompletionCheckInterval);
				this.macroCompletionCheckInterval = null;
			}

			// Resume realtime mode
			if (this.bufferModeActive && this.swiccSink?.isConnected) {
				try {
					await this.swiccSink.sendMessage('+SPM RT ');
					this.bufferModeActive = false;
				} catch (error) {
					this.logger(`Failed to exit buffer mode: ${error.message}`);
				}
			}

			// Resume gamepad passthrough
			this.startGamepadPassthrough();
			this.triggerStatusChange('Gamepad Passthrough Active');
			this.logger('Resumed gamepad passthrough');

			this.triggerMacroComplete();
		}
	}

	/**
	 * Configure burst sending parameters.
	 * @param {number} burstSize - Number of frames to send per burst
	 * @param {number} bufferThreshold - Buffer fill threshold (0.0 to 1.0)
	 */
	configureBurstSending(burstSize = 30, bufferThreshold = 0.5) {
		this.burstSize = Math.max(1, burstSize);
		this.bufferThreshold = Math.max(0.1, Math.min(0.9, bufferThreshold));
		this.logger(`Burst sending configured: ${this.burstSize} frames per burst, ${(this.bufferThreshold * 100).toFixed(0)}% buffer threshold`);
	}

	/**
	 * Get current playback state.
	 * @returns {Object} Current state
	 */
	getState() {
		return {
			gamepadPassthroughActive: this.gamepadPassthroughActive,
			macroPlaybackActive: this.macroPlaybackActive,
			macroFrameCount: this.macroFrames.length,
			currentFrameIndex: this.currentFrameIndex,
			bufferModeActive: this.bufferModeActive,
			burstSize: this.burstSize,
			bufferThreshold: this.bufferThreshold
		};
	}

	/**
	 * Trigger status change callback.
	 * @param {string} status - New status
	 * @private
	 */
	triggerStatusChange(status) {
		if (this.onStatusChange) {
			this.onStatusChange(status);
		}
	}

	/**
	 * Trigger macro progress callback.
	 * @param {number} current - Current frame
	 * @param {number} total - Total frames
	 * @private
	 */
	triggerMacroProgress(current, total) {
		if (this.onMacroProgress) {
			this.onMacroProgress(current, total);
		}
	}

	/**
	 * Trigger macro complete callback.
	 * @private
	 */
	triggerMacroComplete() {
		if (this.onMacroComplete) {
			this.onMacroComplete();
		}
	}

	/**
	 * Trigger error callback.
	 * @param {string} message - Error message
	 * @private
	 */
	triggerError(message) {
		if (this.onError) {
			this.onError(message);
		}
	}
}