/**
 * ./src/core/Engine.js
 *
 * Main engine that orchestrates the flow from input sources through 
 * manipulators to output sinks, with rumble feedback support.
 */

import { ManipulatorPipeline } from '../manipulators/ManipulatorPipeline.js';

/**
 * @typedef {Object} EngineOptions
 * @property {boolean} [autoStart=true] - Start the engine automatically
 */

/**
 * The main engine that coordinates input sources, manipulators, and output sinks.
 */
export class Engine {
	/**
	 * @param {EngineOptions} options
	 */
	constructor(options = {}) {
		this.autoStart = options.autoStart ?? true;

		// Core components
		this.sources = new Map(); // name -> source
		this.sinks = new Map();   // name -> sink
		this.rumbleEnabled = true;
		this.pipeline = new ManipulatorPipeline();

		// Runtime state
		this.isRunning = false;
		this.animationFrame = null;

		// Stats
		this.stats = {
			framesProcessed: 0,
			lastFPS: 0,
			lastStatsUpdate: 0
		};

		if (this.autoStart) {
			this.start();
		}
	}

	/**
	 * Add an input source.
	 * @param {string} name - Unique name for this source
	 * @param {Object} source - Source object with getState() method and optional setRumble() method
	 */
	addSource(name, source) {
		if (typeof source.getState !== 'function') {
			throw new Error('Source must have a getState() method');
		}
		this.sources.set(name, source);
		return this;
	}

	/**
	 * Add an output sink.
	 * @param {string} name - Unique name for this sink
	 * @param {Object} sink - Sink object with send() method and optional getRumble() method
	 */
	addSink(name, sink) {
		if (typeof sink.send !== 'function') {
			throw new Error('Sink must have a send() method');
		}
		this.sinks.set(name, sink);
		return this;
	}

	/**
	 * Remove a source.
	 * @param {string} name
	 */
	removeSource(name) {
		this.sources.delete(name);
		return this;
	}

	/**
	 * Remove a sink.
	 * @param {string} name
	 */
	removeSink(name) {
		this.sinks.delete(name);
		return this;
	}

	/**
	 * Get the manipulator pipeline.
	 * @returns {ManipulatorPipeline}
	 */
	getPipeline() {
		return this.pipeline;
	}

	/**
	 * Start the engine.
	 */
	start() {
		if (this.isRunning) return;

		this.isRunning = true;
		this.lastFrameTime = performance.now();
		this.stats.lastStatsUpdate = this.lastFrameTime;

		console.log('[Engine] Starting...');
		this.tick();
	}

	/**
	 * Stop the engine.
	 */
	stop() {
		if (!this.isRunning) return;

		this.isRunning = false;
		if (this.animationFrame) {
			cancelAnimationFrame(this.animationFrame);
			this.animationFrame = null;
		}

		console.log('[Engine] Stopped');
	}

	/**
	 * Main processing loop.
	 * @private
	 */
	tick() {
		if (!this.isRunning) return;

		this.processFrame();

		this.animationFrame = requestAnimationFrame(() => this.tick());
	}

	/**
	 * Collect rumble values from all sinks.
	 * @private
	 * @returns {Object} Combined rumble values
	 */
	collectRumbleFromSinks() {
		let combinedRumble = {
			rumbleLowFreq: 0,
			rumbleHighFreq: 0
		};

		for (const [sinkName, sink] of this.sinks) {
			try {
				// Check if sink supports rumble feedback
				if (typeof sink.getRumble === 'function') {
					const rumble = sink.getRumble();
					if (rumble) {
						// Combine rumble values (taking maximum)
						combinedRumble.rumbleLowFreq = Math.max(
							combinedRumble.rumbleLowFreq,
							rumble.rumbleLowFreq || 0
						);
						combinedRumble.rumbleHighFreq = Math.max(
							combinedRumble.rumbleHighFreq,
							rumble.rumbleHighFreq || 0
						);
					}
				}
			} catch (err) {
				console.error(`[Engine] Error getting rumble from sink ${sinkName}:`, err);
			}
		}

		return combinedRumble;
	}

	/**
	 * Send rumble values to all sources that support it.
	 * @private
	 * @param {Object} rumble - Rumble values to send
	 */
	sendRumbleToSources(rumble) {
		for (const [sourceName, source] of this.sources) {
			try {
				// Check if source supports rumble feedback
				if (typeof source.setRumble === 'function') {
					source.setRumble(rumble);
				}
			} catch (err) {
				console.error(`[Engine] Error sending rumble to source ${sourceName}:`, err);
			}
		}
	}

	/**
	 * Process one frame of input/output.
	 * @private
	 */
	processFrame() {
		// Collect input from all sources
		const inputs = new Map();
		for (const [name, source] of this.sources) {
			try {
				const input = source.getState();
				if (input && input.state) {
					inputs.set(name, input);
				}
			} catch (err) {
				console.error(`[Engine] Error reading from source ${name}:`, err);
			}
		}

		// Process each input through the pipeline and send to sinks
		for (const [sourceName, input] of inputs) {
			try {
				// Process through manipulator pipeline
				const processedState = this.pipeline.process(input.state);

				// Send to all sinks
				for (const [sinkName, sink] of this.sinks) {
					try {
						sink.send({ state: processedState });
					} catch (err) {
						console.error(`[Engine] Error sending to sink ${sinkName}:`, err);
					}
				}
			} catch (err) {
				console.error(`[Engine] Error processing input from ${sourceName}:`, err);
			}
		}

		if (this.rumbleEnabled) {
			// Collect rumble feedback from sinks and send to sources
			const rumbleValues = this.collectRumbleFromSinks();
			if (rumbleValues.rumbleLowFreq > 0 || rumbleValues.rumbleHighFreq > 0) {
				this.sendRumbleToSources(rumbleValues);
			}
		}

		this.stats.framesProcessed++;
	}

	/**
	 * Enable or disable rumble globally
	 * @param {boolean} enabled - Whether rumble should be enabled
	 */
	setRumbleEnabled(enabled) {
		this.rumbleEnabled = enabled;

		// If disabling, send zero rumble to all sources to stop any ongoing rumble
		if (!enabled) {
			this.sendRumbleToSources({
				rumbleLowFreq: 0,
				rumbleHighFreq: 0
			});
		}
	}

	/**
	 * Get current rumble enabled state
	 * @returns {boolean} Current rumble enabled state
	 */
	getRumbleEnabled() {
		return this.rumbleEnabled;
	}

	/**
	 * Get engine status and performance stats.
	 * @returns {Object}
	 */
	getStatus() {
		return {
			isRunning: this.isRunning,
			actualFPS: this.stats.lastFPS,
			sources: Array.from(this.sources.keys()),
			sinks: Array.from(this.sinks.keys()),
			pipeline: this.pipeline.getStatus()
		};
	}
}