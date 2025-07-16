/**
 * /src/core/ControllerState.js
 *
 * Implements classes to manage controller state for a 2wiCC.
 */

/**
 * ControllerState: manages digital buttons, analog sticks, and IMU data.
 */
class ControllerState {
	constructor() {

		// Digital state
		this.digital = {
			buttonY: false,
			buttonX: false,
			buttonB: false,
			buttonA: false,
			buttonRightSR: false,
			buttonRightSL: false,
			buttonR: false,
			buttonZR: false,
			buttonMinus: false,
			buttonPlus: false,
			buttonThumbR: false,
			buttonThumbL: false,
			buttonHome: false,
			buttonCapture: false,
			chargingGrip: false,
			dpadDown: false,
			dpadUp: false,
			dpadRight: false,
			dpadLeft: false,
			buttonLeftSR: false,
			buttonLeftSL: false,
			buttonL: false,
			buttonZL: false,
		};

		// Analog sticks state normalized [-1, 1]
		this.analog = {
			leftX: 0,
			leftY: 0,
			rightX: 0,
			rightY: 0,
		};

		// IMU samples: array of 3 samples of {accelX, accelY, accelZ, gyroX, gyroY, gyroZ}
		this.imuSamples = [
			{ accelX: 0, accelY: 0, accelZ: 0, gyroX: 0, gyroY: 0, gyroZ: 0 },
			{ accelX: 0, accelY: 0, accelZ: 0, gyroX: 0, gyroY: 0, gyroZ: 0 },
			{ accelX: 0, accelY: 0, accelZ: 0, gyroX: 0, gyroY: 0, gyroZ: 0 },
		];
	}

	/**
	 * Update one or more digital button states.
	 */
	setDigitalState(partial) {
		Object.assign(this.digital, partial);
	}

	/**
	 * Update one or more analog stick values.
	 */
	setAnalogState(partial) {
		Object.assign(this.analog, partial);
	}

	/**
	 * Set IMU samples array. Must be an array of 3 objects with accelX, accelY, accelZ, gyroX, gyroY, gyroZ (16-bit ints).
	 */
	setIMUSamples(samples) {
		if (!Array.isArray(samples) || samples.length !== 3) {
			throw new Error('IMU data must be an array of 3 samples');
		}
		samples.forEach((s, i) => {
			['accelX', 'accelY', 'accelZ', 'gyroX', 'gyroY', 'gyroZ'].forEach((key) => {
				if (typeof s[key] !== 'number') {
					throw new Error(`Sample ${i} missing numeric ${key}`);
				}
			});
		});
		this.imuSamples = samples.map(s => ({ ...s }));
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
	 * Pack all of the controller data (digital + optional analog)
	 * and return a Uint8Array of ASCII codes for the hex representation.
	 * Each input byte becomes two ASCII bytes: [0–9,A–F].
	 */
	getPacketHexBytes(includeAnalog = true) {
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
		const d = this.digital;
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
			const lx = packAxis(this.analog.leftX);
			const ly = packAxis(-this.analog.leftY);
			const rx = packAxis(this.analog.rightX);
			const ry = packAxis(-this.analog.rightY);

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
	 * Create a ControllerState from a browser Gamepad object.
	 * Maps axes and buttons into the 2wiCC ControllerState format.
	 * @param {Gamepad} gp
	 * @returns {ControllerState}
	 */
	static fromGamepad(gp) {
		const cs = new ControllerState();
		// Map digital buttons
		const d = cs.digital;
		// Standard mapping: https://www.w3.org/TR/gamepad/#remapping
		d.buttonA = gp.buttons[1]?.pressed ?? false;
		d.buttonB = gp.buttons[0]?.pressed ?? false;
		d.buttonX = gp.buttons[3]?.pressed ?? false;
		d.buttonY = gp.buttons[2]?.pressed ?? false;
		d.buttonL = gp.buttons[4]?.pressed ?? false;
		d.buttonR = gp.buttons[5]?.pressed ?? false;
		d.buttonZL = gp.buttons[6]?.pressed ?? false;
		d.buttonZR = gp.buttons[7]?.pressed ?? false;
		d.buttonMinus = gp.buttons[8]?.pressed ?? false;
		d.buttonPlus = gp.buttons[9]?.pressed ?? false;
		d.buttonThumbL = gp.buttons[10]?.pressed ?? false;
		d.buttonThumbR = gp.buttons[11]?.pressed ?? false;
		d.dpadUp = gp.buttons[12]?.pressed ?? false;
		d.dpadDown = gp.buttons[13]?.pressed ?? false;
		d.dpadLeft = gp.buttons[14]?.pressed ?? false;
		d.dpadRight = gp.buttons[15]?.pressed ?? false;
		d.buttonHome = gp.buttons[16]?.pressed ?? false;
		d.buttonCapture = gp.buttons[17]?.pressed ?? false;
		// chargingGrip ignored
		d.chargingGrip = false;
		// Map analog triggers if present
		if (!d.buttonZL) {
			const lt = gp.buttons[6]?.value ?? 0;
			d.buttonZL = lt > 0.5;
		}
		if (!d.buttonZR) {
			const rt = gp.buttons[7]?.value ?? 0;
			d.buttonZR = rt > 0.5;
		}

		// Map analog stick axes [-1,1]
		const a = cs.analog;
		a.leftX = gp.axes[0] ?? 0;
		a.leftY = gp.axes[1] ?? 0;
		a.rightX = gp.axes[2] ?? 0;
		a.rightY = gp.axes[3] ?? 0;

		return cs;
	}

}

export { ControllerState };