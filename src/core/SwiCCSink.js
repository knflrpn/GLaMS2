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
	 * Send a ControllerState packet with 2wiCC protocol formatting.
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
		// Send the data - use the SwiCC-specific formatting
		const packet = this._encodeControllerStateTo2wiCC(state, includeAnalog);
		this.writer.write(packet);
		// Send the closure
		await this.writer.write(this.textEncoder.encode("\n"));
	}

	/**
	 * Send a ControllerState packet with SwiCC protocol formatting.
	 * @param {ControllerState} state
	 */
	async sendBasicSwiCC(state) {
		if (!this.writer) {
			throw new Error('SerialComm: writer not ready (call setPort first)');
		}
		// Send the appropriate header
		const preamble = this.textEncoder.encode("+IMM ");
		this.writer.write(preamble);
		// Send the data - use the SwiCC-specific formatting
		const packet = this._encodeControllerStateToSwiCC(state);
		this.writer.write(packet);
		// Send the closure
		await this.writer.write(this.textEncoder.encode("\n"));
	}

	/**
	 * Pack IMU samples: three samples of 16-bit LE accelX, accelY, accelZ, gyroX, gyroY, gyroZ.
	 * This exact format is required for SwiCC.
	 */
	getPackedIMU() {
		const buf = new DataView(new ArrayBuffer(36));
		this.imuSamples.forEach((s, idx) => {
			const base = idx * 12;
			buf.setInt16(base, s.accelX, true);
			buf.setInt16(base + 2, s.accelY, true);
			buf.setInt16(base + 4, s.accelZ, true);
			buf.setInt16(base + 6, s.gyroX, true);
			buf.setInt16(base + 8, s.gyroY, true);
			buf.setInt16(base + 10, s.gyroZ, true);
		});
		return new Uint8Array(buf.buffer);
	}

	/**
	 * Encode a ControllerState to SwiCC protocol format.
	 * Pack all of the controller data (digital + optional analog)
	 * and return a Uint8Array of ASCII codes for the hex representation.
	 * Each input byte becomes two ASCII bytes: [0–9,A–F].
	 * @param {ControllerState} state
	 * @param {boolean} includeAnalog
	 * @returns {Uint8Array}
	 * @private
	 */
	_encodeControllerStateTo2wiCC(state, includeAnalog = true) {
		const hexLen = (includeAnalog ? 9 : 3) * 2;
		const out = new Uint8Array(hexLen);
		let ptr = 0;

		// helper to write one byte as two hex ASCII bytes
		const writeHexByte = b => {
			const hi = b >>> 4;
			const lo = b & 0xF;
			let c = hi + 0x30;
			if (c > 0x39) c += 7;
			out[ptr++] = c;
			c = lo + 0x30;
			if (c > 0x39) c += 7;
			out[ptr++] = c;
		};

		//—— pack digital into b0,b1,b2 ——
		const d = state.digital;
		const b0 =
			(d.buttonY ? 1 : 0)
			| ((d.buttonX ? 1 : 0) << 1)
			| ((d.buttonB ? 1 : 0) << 2)
			| ((d.buttonA ? 1 : 0) << 3)
			| ((d.buttonRightSR ? 1 : 0) << 4)
			| ((d.buttonRightSL ? 1 : 0) << 5)
			| ((d.buttonR ? 1 : 0) << 6)
			| ((d.buttonZR ? 1 : 0) << 7);
		const b1 =
			(d.buttonMinus ? 1 : 0)
			| ((d.buttonPlus ? 1 : 0) << 1)
			| ((d.buttonThumbR ? 1 : 0) << 2)
			| ((d.buttonThumbL ? 1 : 0) << 3)
			| ((d.buttonHome ? 1 : 0) << 4)
			| ((d.buttonCapture ? 1 : 0) << 5)
			| ((d.chargingGrip ? 1 : 0) << 7);
		const b2 =
			(d.dpadDown ? 1 : 0)
			| ((d.dpadUp ? 1 : 0) << 1)
			| ((d.dpadRight ? 1 : 0) << 2)
			| ((d.dpadLeft ? 1 : 0) << 3)
			| ((d.buttonLeftSR ? 1 : 0) << 4)
			| ((d.buttonLeftSL ? 1 : 0) << 5)
			| ((d.buttonL ? 1 : 0) << 6)
			| ((d.buttonZL ? 1 : 0) << 7);

		writeHexByte(b0);
		writeHexByte(b1);
		writeHexByte(b2);

		if (includeAnalog) {
			// local packAxis returns {h,m,l} nibbles
			const packAxis = v => {
				const raw = Math.round(v * 0x600 + 0x800);
				const c = Math.min(0xFFF, Math.max(0, raw));
				return { h: (c >> 8) & 0xF, m: (c >> 4) & 0xF, l: c & 0xF };
			};

			// Between standard PC and Switch, X axis stays, Y flips
			const lx = packAxis(state.analog.leftX);
			const ly = packAxis(-state.analog.leftY);
			const rx = packAxis(state.analog.rightX);
			const ry = packAxis(-state.analog.rightY);

			// arrange the 6 analog bytes in the required order
			const analogBytes = [
				(lx.m << 4) | lx.l,
				(ly.l << 4) | lx.h,
				(ly.h << 4) | ly.m,
				(rx.m << 4) | rx.l,
				(ry.l << 4) | rx.h,
				(ry.h << 4) | ry.m
			];
			for (const b of analogBytes) writeHexByte(b);
		}

		return out;  // Uint8Array of ASCII
	}

	/**
	 * Encode a ControllerState to legacy SwiCC protocol format (v1).
	 * This maintains backwards compatibility with older hardware that expects
	 * the IMM command format with 7 hex bytes (14 ASCII characters).
	 * @param {ControllerState} state
	 * @returns {Uint8Array}
	 * @private
	 */
	_encodeControllerStateToSwiCC(state) {
		// Create 7-byte array for legacy format
		const swCon = new Uint8Array(7);
		const d = state.digital;

		// Byte 0 (high byte in legacy format)
		swCon[0] =
			(d.buttonMinus ? 1 : 0) |
			((d.buttonPlus ? 1 : 0) << 1) |
			((d.buttonThumbL ? 1 : 0) << 2) |
			((d.buttonThumbR ? 1 : 0) << 3) |
			((d.buttonHome ? 1 : 0) << 4) |
			((d.buttonCapture ? 1 : 0) << 5);

		// Byte 1 (low byte in legacy format)
		swCon[1] =
			(d.buttonY ? 1 : 0) |
			((d.buttonB ? 1 : 0) << 1) |
			((d.buttonA ? 1 : 0) << 2) |
			((d.buttonX ? 1 : 0) << 3) |
			((d.buttonL ? 1 : 0) << 4) |
			((d.buttonR ? 1 : 0) << 5) |
			((d.buttonZL ? 1 : 0) << 6) |
			((d.buttonZR ? 1 : 0) << 7);

		// Byte 2 - D-pad encoding (legacy 8-direction + neutral format)
		let dpval = (d.dpadUp ? 1 : 0) +
			(d.dpadRight ? 2 : 0) +
			(d.dpadDown ? 4 : 0) +
			(d.dpadLeft ? 8 : 0);

		switch (dpval) {
			case 1: // up
				swCon[2] = 0;
				break;
			case 3: // up-right
				swCon[2] = 1;
				break;
			case 2: // right
				swCon[2] = 2;
				break;
			case 6: // down-right
				swCon[2] = 3;
				break;
			case 4: // down
				swCon[2] = 4;
				break;
			case 12: // down-left
				swCon[2] = 5;
				break;
			case 8: // left
				swCon[2] = 6;
				break;
			case 9: // up-left
				swCon[2] = 7;
				break;
			default: // neutral
				swCon[2] = 8;
		}

		// Helper function to convert analog stick value [-1,1] to byte centered at 128
		const stick2Byte = (sval, deadzone = 0.1) => {
			if (Math.abs(sval) <= deadzone) return 128;
			let byte = 0;
			if (sval >= 0) {
				byte = Math.floor(128 + 128 * (sval - deadzone) / (1 - deadzone));
			} else {
				byte = Math.floor(128 + 127 * (sval + deadzone) / (1 - deadzone));
			}
			return Math.max(0, Math.min(255, byte));
		};

		// Bytes 3-6: Analog sticks (legacy format uses simple byte encoding)
		swCon[3] = stick2Byte(state.analog.leftX);
		swCon[4] = stick2Byte(state.analog.leftY);
		swCon[5] = stick2Byte(state.analog.rightX);
		swCon[6] = stick2Byte(state.analog.rightY);

		// Convert to hex ASCII representation (14 characters for 7 bytes)
		const hexOut = new Uint8Array(14);
		let ptr = 0;

		for (let i = 0; i < 7; i++) {
			const b = swCon[i];
			const hi = b >>> 4;
			const lo = b & 0xF;

			// Convert to ASCII hex (0-9, A-F)
			let c = hi + 0x30;
			if (c > 0x39) c += 7;
			hexOut[ptr++] = c;

			c = lo + 0x30;
			if (c > 0x39) c += 7;
			hexOut[ptr++] = c;
		}

		return hexOut;
	}

	/**
	 * Send an arbitrary string message to the SwiCC.
	 * @param {string} message - The message to send
	 * @param {boolean} [addNewline=true] - Whether to automatically add a newline
	 */
	async sendString(message, addNewline = true) {
		if (!this.writer) {
			throw new Error('SerialComm: writer not ready (call setPort first)');
		}

		const messageToSend = addNewline ? message + '\n' : message;
		const encoded = this.textEncoder.encode(messageToSend);
		await this.writer.write(encoded);
	}

	/**
	 * Send raw bytes to the SwiCC.
	 * @param {Uint8Array} bytes - The bytes to send
	 */
	async sendBytes(bytes) {
		if (!this.writer) {
			throw new Error('SerialComm: writer not ready (call setPort first)');
		}
		await this.writer.write(bytes);
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
 * @property {boolean} [autoInterrogate=true]      - automatically query device info on connect
 * @property {number} [interrogateTimeout=1000]    - timeout for device interrogation in ms
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
		onMessage = (msg) => { this.logMessage(msg); },
		logMessage = (msg) => { console.log(msg); },
		autoInterrogate = true,
		interrogateTimeout = 2000
	} = {}) {
    /** @private */ this.filters = filters;
    /** @private */ this.serialOptions = serialOptions;
    /** @private */ this.comm = new SerialComm();
    /** @private {SerialPort|null} */ this._port = null;
    /** @private */ this._isConnected = false;
    /** @private */ this.onDisconnect = onDisconnect;
    /** @private */ this.onMessage = onMessage;
    /** @private */ this.logMessage = logMessage;
    /** @private */ this.autoInterrogate = autoInterrogate;
    /** @private */ this.interrogateTimeout = interrogateTimeout;

    // Device information
    /** @private */ this._deviceId = null;
    /** @private */ this._deviceVersion = null;
    /** @private */ this._isInterrogated = false;

    // Interrogation state
    /** @private */ this._interrogationPromise = null;
    /** @private */ this._interrogationResolve = null;
    /** @private */ this._interrogationReject = null;
    /** @private */ this._interrogationTimeout = null;
    /** @private */ this._awaitingIdResponse = false;
    /** @private */ this._awaitingVersionResponse = false;

		// bind once so we can remove later
		this._handlePortDisconnect = this._handlePortDisconnect.bind(this);
		this._handleReadError = this._handleReadError.bind(this);
		this._handleInterrogationMessage = this._handleInterrogationMessage.bind(this);
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
		
		let portOpened = false;
		let commSetup = false;
		let readingStarted = false;
		
		try {
			await this._port.open(this.serialOptions);
			portOpened = true;
			
			this.comm.setPort(this._port);
			commSetup = true;
			
			this._isConnected = true;

			// Start reading automatically when port opens
			this.comm.startReading(this._handleMessage.bind(this), this._handleReadError);
			readingStarted = true;

			console.log('[SwiCCSink] Connected to device');

			// Automatically interrogate device if enabled
			if (this.autoInterrogate) {
				try {
					await this._interrogateDevice();
				} catch (interrogationErr) {
					// If interrogation fails, clean up and re-throw
					console.error('[SwiCCSink] Device interrogation failed during initialization:', interrogationErr);
					throw interrogationErr;
				}
			}
		} catch (err) {
			console.error('[SwiCCSink] Failed to open port:', err);
			
			// Clean up in reverse order of what was set up
			this._isConnected = false;
			
			if (readingStarted || commSetup) {
				try {
					await this.comm.disconnect();
				} catch (_) { 
					// Ignore cleanup errors
				}
			}
			
			if (portOpened && this._port) {
				try {
					await this._port.close();
				} catch (_) { 
					// Ignore cleanup errors
				}
			}
			
			// Reset state
			this._port = null;
			this._deviceId = null;
			this._deviceVersion = null;
			this._isInterrogated = false;
			this._cleanupInterrogation();
			
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
			if (this._deviceId === "2wiCC")
				await this.comm.sendBasic(state, true);
			if (this._deviceId === "SwiCC")
				await this.comm.sendBasicSwiCC(state, true);
		} catch (err) {
			console.warn('[SwiCCSink] send failed—assuming port lost:', err);
			// clean up writer + port
			await this._fullCleanup();
			// notify caller exactly once
			try { this.onDisconnect(); } catch (_) { }
		}
	}

	/**
	 * Send an arbitrary string message to the SwiCC.
	 * If the write fails (e.g. port unplugged), we tear down,
	 * call onDisconnect once, and swallow further errors.
	 * @param {string} message - The message to send
	 * @param {boolean} [addNewline=true] - Whether to automatically add a newline
	 * @returns {Promise<void>}
	 */
	async sendMessage(message, addNewline = true) {
		if (!this._isConnected) {
			// already offline; no-op
			return;
		}
		try {
			await this.comm.sendString(message, addNewline);
		} catch (err) {
			console.warn('[SwiCCSink] sendMessage failed—assuming port lost:', err);
			// clean up writer + port
			await this._fullCleanup();
			// notify caller exactly once
			try { this.onDisconnect(); } catch (_) { }
		}
	}

	/**
	 * Send raw bytes to the SwiCC.
	 * If the write fails (e.g. port unplugged), we tear down,
	 * call onDisconnect once, and swallow further errors.
	 * @param {Uint8Array} bytes - The bytes to send
	 * @returns {Promise<void>}
	 */
	async sendBytes(bytes) {
		if (!this._isConnected) {
			// already offline; no-op
			return;
		}
		try {
			await this.comm.sendBytes(bytes);
		} catch (err) {
			console.warn('[SwiCCSink] sendBytes failed—assuming port lost:', err);
			// clean up writer + port
			await this._fullCleanup();
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

		await this._fullCleanup();
		this.logMessage('Disconnected from device');
	}

	/**
	 * Internal method to perform complete cleanup of all resources.
	 * @private
	 */
	async _fullCleanup() {
		// Clean up any ongoing interrogation
		this._cleanupInterrogation();

		// Reset device info
		this._deviceId = null;
		this._deviceVersion = null;
		this._isInterrogated = false;

		// Remove event listener
		navigator.serial.removeEventListener('disconnect', this._handlePortDisconnect);

		try {
			await this.comm.disconnect();
		} catch (err) {
			console.warn('[SwiCCSink] comm.disconnect() error:', err);
		}

		this._isConnected = false;
		this._port = null;
	}

	/**
	 * Update the message handler after construction.
	 * @param {(message: string) => void} handler
	 */
	setMessageHandler(handler) {
		this.onMessage = handler;
	}

	/**
	 * Check if the sink is currently connected.
	 * @returns {boolean}
	 */
	get isConnected() {
		return this._isConnected;
	}

	/**
	 * Get the device ID (e.g., "SwiCC").
	 * @returns {string|null}
	 */
	get deviceId() {
		return this._deviceId;
	}

	/**
	 * Get the device version (e.g., "1.0").
	 * @returns {string|null}
	 */
	get deviceVersion() {
		return this._deviceVersion;
	}

	/**
	 * Check if device interrogation has been completed.
	 * @returns {boolean}
	 */
	get isInterrogated() {
		return this._isInterrogated;
	}

	/**
	 * Manually interrogate the device for ID and version.
	 * @returns {Promise<{id: string, version: string}>}
	 */
	async interrogateDevice() {
		if (!this._isConnected) {
			throw new Error('Not connected to device');
		}
		return await this._interrogateDevice();
	}

	/**
	 * Internal method to interrogate the device.
	 * @private
	 * @returns {Promise<{id: string, version: string}>}
	 */
	async _interrogateDevice() {
		// If already interrogating, return the existing promise
		if (this._interrogationPromise) {
			return this._interrogationPromise;
		}

		this._interrogationPromise = new Promise((resolve, reject) => {
			this._interrogationResolve = resolve;
			this._interrogationReject = reject;

			// Set up timeout
			this._interrogationTimeout = setTimeout(() => {
				this._cleanupInterrogation();
				reject(new Error('Device interrogation timeout'));
			}, this.interrogateTimeout);

			// Start the interrogation sequence
			this._startInterrogationSequence();
		});

		try {
			const result = await this._interrogationPromise;
			this._isInterrogated = true;
			this.logMessage('Device interrogated successfully: ' + JSON.stringify(result, null, 2));
			return result;
		} catch (err) {
			this.logMessage('Device interrogation failed: ' + err);
			throw err;
		} finally {
			this._cleanupInterrogation();
		}
	}

	/**
	 * Start the device interrogation sequence.
	 * @private
	 */
	async _startInterrogationSequence() {
		try {
			// Query device ID
			this._awaitingIdResponse = true;
			await this.comm.sendString('+ID ');
		} catch (err) {
			this._cleanupInterrogation();
			if (this._interrogationReject) {
				this._interrogationReject(err);
			}
		}
	}

	/**
	 * Handle messages during interrogation and normal operation.
	 * @private
	 * @param {string} message
	 */
	_handleMessage(message) {
		// If interrogating, sniff the message to check if it's a response.
		if (this._interrogationPromise) {
			const wasInterrogationMessage = this._handleInterrogationMessage(message);
			// If it was an interrogation response, don't pass it on.
			if (wasInterrogationMessage) {
				return;
			}
		}

		// Normal message handling
		this.onMessage(message);
	}

	/**
	 * Handle messages during device interrogation.
	 * @private
	 * @param {string} message
	 * @returns {boolean} true if this was an interrogation response, false otherwise
	 */
	_handleInterrogationMessage(message) {
		const trimmed = message.trim();

		if (this._awaitingIdResponse) {
			if (trimmed.startsWith('+')) {
				this._deviceId = trimmed.substring(1); // Remove the leading '+'
				this._awaitingIdResponse = false;
				this._awaitingVersionResponse = true;

				// Query version
				this.comm.sendString('+VER ').catch(err => {
					this._cleanupInterrogation();
					if (this._interrogationReject) {
						this._interrogationReject(err);
					}
				});
				return true; // This was an interrogation response
			}
		} else if (this._awaitingVersionResponse) {
			if (trimmed.startsWith('+VER ')) {
				const versionMatch = trimmed.match(/\+VER\s+(.+)/);
				if (versionMatch) {
					this._deviceVersion = versionMatch[1];
					this._awaitingVersionResponse = false;

					// Interrogation complete
					if (this._interrogationResolve) {
						this._interrogationResolve({
							id: this._deviceId,
							version: this._deviceVersion
						});
					}
				}
				return true; // This was an interrogation response
			}
		}

		return false; // This was not an interrogation response
	}

	/**
	 * Clean up interrogation state.
	 * @private
	 */
	_cleanupInterrogation() {
		if (this._interrogationTimeout) {
			clearTimeout(this._interrogationTimeout);
			this._interrogationTimeout = null;
		}

		this._interrogationPromise = null;
		this._interrogationResolve = null;
		this._interrogationReject = null;
		this._awaitingIdResponse = false;
		this._awaitingVersionResponse = false;
	}

	/**
	 * Global handler for any unplugged serial device.
	 * Only cares if it was *our* port.
	 * @param {SerialDisconnectEvent} event
	 * @private
	 */
	_handlePortDisconnect(event) {
		if (event.port === this._port) {
			this.logMessage('[SwiCCSink] Detected physical disconnect.');
			this._fullCleanup().catch(() => { });
			try { this.onDisconnect(); } catch (_) { }
		}
	}

	/**
	 * Handle read errors (e.g., port disconnected during read).
	 * @param {Error} error
	 * @private
	 */
	_handleReadError(error) {
		this.logMessage('[SwiCCSink] Read error:' + error);
		this._fullCleanup().catch(() => { });
		try { this.onDisconnect(); } catch (_) { }
	}
}