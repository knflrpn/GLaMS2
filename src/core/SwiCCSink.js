// /src/core/SwiCCSink.js

import { ControllerState } from './ControllerState.js';

/**
 * Internal helper that wraps a SerialPort + writer
 * and exposes a simple send(state, includeAnalog) API.
 */
class SerialComm {
	constructor() {
		/** @type {SerialPort|null} */
		this.port = null;
		/** @type {WritableStreamDefaultWriter<Uint8Array>|null} */
		this.writer = null;
		/** @type {ReadableStreamDefaultReader<Uint8Array>|null} */
		this.reader = null;
		this.textEncoder = new TextEncoder('ascii');
		this.textDecoder = new TextDecoder('ascii');

		// Buffer for accumulating partial messages
		this.readBuffer = '';

		// Reading state
		this.isReading = false;
		this.readingTask = null;
	}

	/**
	 * Attach the port and grab its writable-stream writer and readable-stream reader.
	 * @param {SerialPort} port
	 */
	setPort(port) {
		this.port = port;
		this.writer = port.writable.getWriter();
		this.reader = port.readable.getReader();
	}

	/**
	 * Start reading from the serial port.
	 * @param {(message: string) => void} onMessage - Callback for complete messages
	 * @param {(error: Error) => void} onError - Callback for read errors
	 */
	startReading(onMessage, onError) {
		if (this.isReading) return;

		this.isReading = true;
		this.readingTask = this._readLoop(onMessage, onError);
	}

	/**
	 * The main read loop that processes incoming data.
	 * @private
	 */
	async _readLoop(onMessage, onError) {
		try {
			while (this.isReading && this.reader) {
				const { value, done } = await this.reader.read();

				if (done) {
					this.isReading = false;
					break;
				}

				if (value) {
					// Decode the chunk and add to buffer
					const chunk = this.textDecoder.decode(value);
					this.readBuffer += chunk;

					// Process complete messages
					let newlineIndex;
					while ((newlineIndex = this.readBuffer.indexOf('\n')) !== -1) {
						// Extract the complete message (without the newline)
						const message = this.readBuffer.substring(0, newlineIndex);
						this.readBuffer = this.readBuffer.substring(newlineIndex + 1);

						// Deliver the message if it's not empty
						if (message.length > 0) {
							try {
								onMessage(message);
							} catch (err) {
								console.error('[SerialComm] Error in message handler:', err);
							}
						}
					}
				}
			}
		} catch (err) {
			this.isReading = false;
			onError(err);
		}
	}

	/**
	 * Stop reading from the serial port.
	 */
	async stopReading() {
		if (this.reader) {
			try {
				await this.reader.cancel();
			} catch (_) { }
		}
	}

	/**
	 * Send a ControllerState packet.
	 * @param {ControllerState} state
	 * @param {boolean} includeAnalog
	 */
	async sendBasic(state, includeAnalog = true) {
		if (!this.writer) {
			throw new Error('SerialComm: writer not ready (call setPort first)');
		}
		// Send the appropriate header
		const preamble = includeAnalog
			? this.textEncoder.encode("+QF ") // queue full
			: this.textEncoder.encode("+QD "); // queue digital
		this.writer.write(preamble);
		// Send the data
		const packet = state.getPacketHexBytes(includeAnalog);
		this.writer.write(packet);
		// Send the closure
		await this.writer.write(this.textEncoder.encode("\n"));
	}

	/** Gracefully close reader, writer + port. */
	async disconnect() {
		// Stop reading first
		await this.stopReading();

		if (this.reader) {
			try { await this.reader.cancel(); } catch (_) { }
			try { this.reader.releaseLock(); } catch (_) { }
			this.reader = null;
		}

		if (this.writer) {
			try { await this.writer.close(); } catch (_) { }
			try { this.writer.releaseLock(); } catch (_) { }
			this.writer = null;
		}

		if (this.port) {
			try { await this.port.close(); } catch (_) { }
			this.port = null;
		}

		// Clear the read buffer
		this.readBuffer = '';
	}
}

/**
 * @typedef {Object} SwiCCSinkOptions
 * @property {SerialPortFilter[]} [filters]         - passed to navigator.serial.requestPort
 * @property {SerialOptions}   [serialOptions]     - passed to port.open
 * @property {() => void}      [onDisconnect]      - called once when the port is lost
 * @property {(message: string) => void} [onMessage] - called for each complete message received
 */

/**
 * Wraps navigator.serial → Web Serial APIs and exposes
 * .connect(), .send({state}), .disconnect(), plus onDisconnect and onMessage hooks.
 */
export class SwiCCSink {
	/**
	 * @param {SwiCCSinkOptions} [options={}]
	 */
	constructor({
		filters = [],
		serialOptions = { baudRate: 115200 },
		onDisconnect = () => { },
		onMessage = (msg) => { console.log('[SwiCCSink] Received:', msg); }
	} = {}) {
    /** @private */ this.filters = filters;
    /** @private */ this.serialOptions = serialOptions;
    /** @private */ this.comm = new SerialComm();
    /** @private {SerialPort|null} */ this._port = null;
    /** @private */ this._isConnected = false;
    /** @private */ this.onDisconnect = onDisconnect;
    /** @private */ this.onMessage = onMessage;

		// bind once so we can remove later
		this._handlePortDisconnect = this._handlePortDisconnect.bind(this);
		this._handleReadError = this._handleReadError.bind(this);
		navigator.serial.addEventListener('disconnect', this._handlePortDisconnect);
	}

	/**
	 * Ask the user to pick a port.
	 * @returns {Promise<void>}
	 */
	async requestPort() {
		try {
			this._port = await navigator.serial.requestPort({ filters: this.filters });
			console.log('[SwiCCSink] Port selected');
		} catch (err) {
			console.error('[SwiCCSink] No port selected:', err);
			throw err;
		}
	}

	/**
	 * Open the port the user selected in requestPort().
	 * @returns {Promise<void>}
	 */
	async openPort() {
		if (!this._port) {
			throw new Error('[SwiCCSink] No port selected; call requestPort() first.');
		}
		try {
			await this._port.open(this.serialOptions);
			this.comm.setPort(this._port);
			this._isConnected = true;

			// Start reading automatically when port opens
			this.comm.startReading(this.onMessage, this._handleReadError);

			console.log('[SwiCCSink] Connected to device');
		} catch (err) {
			console.error('[SwiCCSink] Failed to open port:', err);
			throw err;
		}
	}

	/**
	 * Shorthand for: if not already open, requestPort() then openPort().
	 * @returns {Promise<void>}
	 */
	async connect() {
		if (this._isConnected) return;
		if (!this._port) {
			await this.requestPort();
		}
		await this.openPort();
	}

	/**
	 * Send one frame of controller data.
	 * If the write fails (e.g. port unplugged), we tear down,
	 * call onDisconnect once, and swallow further errors.
	 * @param {{ state: ControllerState }} payload
	 * @returns {Promise<void>}
	 */
	async send({ state }) {
		if (!this._isConnected) {
			// already offline; no-op
			return;
		}
		try {
			await this.comm.sendBasic(state, true);
		} catch (err) {
			console.warn('[SwiCCSink] send failed—assuming port lost:', err);
			// clean up writer + port
			await this.comm.disconnect();
			this._isConnected = false;
			// notify caller exactly once
			try { this.onDisconnect(); } catch (_) { }
		}
	}

	/**
	 * Close and clean up the serial connection.
	 * @returns {Promise<void>}
	 */
	async disconnect() {
		if (!this._isConnected) return;
		navigator.serial.removeEventListener('disconnect', this._handlePortDisconnect);
		try {
			await this.comm.disconnect();
			console.log('[SwiCCSink] Disconnected from device');
		} catch (err) {
			console.error('[SwiCCSink] disconnect() error:', err);
		}
		this._isConnected = false;
	}

	/**
	 * Update the message handler after construction.
	 * @param {(message: string) => void} handler
	 */
	setMessageHandler(handler) {
		this.onMessage = handler;
	}

	/**
	 * Global handler for any unplugged serial device.
	 * Only cares if it was *our* port.
	 * @param {SerialDisconnectEvent} event
	 * @private
	 */
	_handlePortDisconnect(event) {
		if (event.port === this._port) {
			console.warn('[SwiCCSink] Detected physical disconnect.');
			// tidy up in case send() wasn't in flight
			this.comm.disconnect().catch(() => { });
			this._isConnected = false;
			try { this.onDisconnect(); } catch (_) { }
		}
	}

	/**
	 * Handle read errors (e.g., port disconnected during read).
	 * @param {Error} error
	 * @private
	 */
	_handleReadError(error) {
		console.error('[SwiCCSink] Read error:', error);
		// Treat read errors as disconnection
		this.comm.disconnect().catch(() => { });
		this._isConnected = false;
		try { this.onDisconnect(); } catch (_) { }
	}
}