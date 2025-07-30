/**
 * ./src/sources/GamepadSource.js
 *
 * Provides a simple pull-based GamepadSource:
 *  - Client calls getState() each frame to retrieve the current ControllerState
 */

import { ControllerState } from '../core/ControllerState.js';

/**
 * A pull-based wrapper around a single navigator.getGamepads() index.
 */
export class GamepadSource {
	/**
	 * @param {number} gamepadIndex - The index of the gamepad as reported by the browser
	 */
	constructor(gamepadIndex = 0) {
		/** @private */
		this.gamepadIndex = gamepadIndex;
	}

	/**
	 * Polls navigator.getGamepads() at this index and returns a ControllerState.
	 * @returns {{ index: number, state: import('../core/ControllerState.js').ControllerState }|null}
	 */
	getState() {
		const gp = navigator.getGamepads()[this.gamepadIndex];
		if (!gp) {
			const state = new ControllerState;
			return { index: -1, state };
		}
		try {
			const state = ControllerState.fromGamepad(gp);
			return { index: this.gamepadIndex, state };
		} catch (err) {
			console.error(`[GamepadSource] Failed to parse gamepad at index ${this.gamepadIndex}:`, err);
			return null;
		}
	}

	/**
	 * Sets rumble/vibration on the gamepad.
	 * @param {Object} rumble - Rumble configuration
	 * @param {number} rumble.rumbleLowFreq - Low frequency rumble magnitude (0.0 to 1.0)
	 * @param {number} rumble.rumbleHighFreq - High frequency rumble magnitude (0.0 to 1.0)
	 * @param {number} [duration=200] - Duration in milliseconds (optional, defaults to 200ms)
	 * @returns {Promise<boolean>} - Returns true if rumble was successfully set, false otherwise
	 */
	async setRumble(rumble, duration = 200) {
		const gp = navigator.getGamepads()[this.gamepadIndex];
		if (!gp) {
			console.warn(`[GamepadSource] No gamepad found at index ${this.gamepadIndex}`);
			return false;
		}

		// Check if the gamepad supports vibration
		if (!gp.vibrationActuator) {
			console.warn(`[GamepadSource] Gamepad at index ${this.gamepadIndex} does not support vibration`);
			return false;
		}

		try {
			// Clamp values to valid range (0.0 to 1.0)
			const lowFreq = Math.max(0, Math.min(1, rumble.rumbleLowFreq || 0));
			const highFreq = Math.max(0, Math.min(1, rumble.rumbleHighFreq || 0));

			await gp.vibrationActuator.playEffect('dual-rumble', {
				duration: duration,
				strongMagnitude: lowFreq,   // Low frequency (strong motor)
				weakMagnitude: highFreq     // High frequency (weak motor)
			});

			return true;
		} catch (err) {
			console.error(`[GamepadSource] Failed to set rumble on gamepad at index ${this.gamepadIndex}:`, err);
			return false;
		}
	}
}