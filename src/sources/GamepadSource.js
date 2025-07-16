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
			return { index: -1, state};
		}
		try {
			const state = ControllerState.fromGamepad(gp);
			return { index: this.gamepadIndex, state };
		} catch (err) {
			console.error(`[GamepadSource] Failed to parse gamepad at index ${this.gamepadIndex}:`, err);
			return null;
		}
	}
}
