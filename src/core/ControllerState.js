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

		// IMU sample: sample of {accelX, accelY, accelZ, gyroX, gyroY, gyroZ}
		// Acc units are m/s/s and gyro units are rad/s.
		this.imuSample = { accelX: 0, accelY: 0, accelZ: 9.81, gyroX: 0, gyroY: 0, gyroZ: 0 };
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
	 * Set IMU samples. accelX, accelY, accelZ, gyroX, gyroY, gyroZ.
	 */
	setIMUSample(sample) {
		['accelX', 'accelY', 'accelZ', 'gyroX', 'gyroY', 'gyroZ'].forEach((key) => {
			if (typeof sample[key] !== 'number') {
				throw new Error(`Sample missing numeric ${key}`);
			}
		});
		this.imuSample = sample.map(s => ({ ...s }));
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