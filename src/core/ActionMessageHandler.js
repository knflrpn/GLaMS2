/**
 * ./src/core/ActionMessageHandler.js
 * 
 * Handles incoming messages to execute actions on manipulators
 */

export class ActionMessageHandler {
	constructor(manipulatorManager) {
		this.manager = manipulatorManager;
		this.handlers = new Map();

		// Register default message handlers
		this._registerDefaultHandlers();
	}

	/**
	 * Register default message handlers
	 * @private
	 */
	_registerDefaultHandlers() {
		// Execute action on specific manipulator
		this.register('executeAction', async (data) => {
			const { manipulatorId, actionName, params } = data;
			return this.manager.executeAction(manipulatorId, actionName, params);
		});

		// Execute action on all manipulators of a type
		this.register('executeActionOnType', async (data) => {
			const { type, actionName, params } = data;
			const results = this.manager.executeActionOnType(type, actionName, params);
			return Object.fromEntries(results);
		});

		// Execute action on all manipulators
		this.register('executeActionOnAll', async (data) => {
			const { actionName, params } = data;
			const results = this.manager.executeActionOnAll(actionName, params);
			return Object.fromEntries(results);
		});

		// Get manipulator info
		this.register('getManipulators', async () => {
			return this.manager.getManipulatorInfo();
		});

		// Get specific manipulator info
		this.register('getManipulator', async (data) => {
			const { manipulatorId } = data;
			const manipulator = this.manager.get(manipulatorId);
			if (!manipulator) {
				throw new Error(`Manipulator not found: ${manipulatorId}`);
			}

			return {
				id: manipulator.id,
				name: manipulator.name,
				type: manipulator.constructor.type,
				enabled: manipulator.enabled,
				actions: this._getActionInfo(manipulator)
			};
		});

		// Find manipulators by criteria
		this.register('findManipulators', async (data) => {
			const { criteria } = data;
			const manipulators = this.manager.getAll();

			return manipulators
				.filter(m => this._matchesCriteria(m, criteria))
				.map(m => ({
					id: m.id,
					name: m.name,
					type: m.constructor.type,
					enabled: m.enabled
				}));
		});
	}

	/**
	 * Check if manipulator matches criteria
	 * @private
	 */
	_matchesCriteria(manipulator, criteria) {
		if (criteria.type && manipulator.constructor.type !== criteria.type) {
			return false;
		}
		if (criteria.enabled !== undefined && manipulator.enabled !== criteria.enabled) {
			return false;
		}
		if (criteria.name && !manipulator.name.includes(criteria.name)) {
			return false;
		}
		return true;
	}

	/**
	 * Get action info for a manipulator
	 * @private
	 */
	_getActionInfo(manipulator) {
		const actions = manipulator.getActions();
		const actionInfo = {};

		actions.forEach((action, name) => {
			actionInfo[name] = {
				displayName: action.displayName,
				description: action.description,
				parameters: action.parameters || []
			};
		});

		return actionInfo;
	}

	/**
	 * Register a custom message handler
	 * @param {string} messageType
	 * @param {Function} handler
	 */
	register(messageType, handler) {
		this.handlers.set(messageType, handler);
	}

	/**
	 * Process an incoming message
	 * @param {Object} message
	 * @returns {Promise<Object>} Response
	 */
	async process(message) {
		const { type, data, id } = message;

		try {
			// Get handler for message type
			const handler = this.handlers.get(type);
			if (!handler) {
				throw new Error(`Unknown message type: ${type}`);
			}

			// Execute handler
			const result = await handler(data);

			// Return success response
			return {
				id,
				type: 'response',
				success: true,
				result
			};

		} catch (error) {
			// Return error response
			return {
				id,
				type: 'response',
				success: false,
				error: error.message
			};
		}
	}

	/**
	 * Create a batch processor for multiple messages
	 * @param {Object[]} messages
	 * @returns {Promise<Object[]>} Responses
	 */
	async processBatch(messages) {
		return Promise.all(messages.map(msg => this.process(msg)));
	}
}

