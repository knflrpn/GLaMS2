class Bot {
	constructor(config = {}) {
		// Command groups configuration
		this.commandGroups = new Map(); // name -> CommandGroup

		// Strategies configuration
		this.strategies = new Map(); // name -> Strategy

		// Current strategy state
		this.currentStrategy = null;
		this.lastStrategySwitch = 0;
		this.globalStrategyMinTime = config.globalStrategyMinTime || 10000; // 10s default
		this.strategyCooldowns = new Map(); // strategyName -> lastUsedTime

		// Message timing and cooldowns
		this.lastMessage = "";
		this.lastMessageTime = 0;
		this.globalCooldown = config.globalCooldown || 100;
		this.groupCooldowns = new Map(); // groupName -> lastUsedTime

		// Statistics
		this.stats = {
			messagesGenerated: 0,
			keywordUsage: new Map(),
			groupUsage: new Map(),
			strategyUsage: new Map()
		};
	}

	// --- Command Group Methods ---
	addCommandGroup(name, config) {
		const group = new CommandGroup(name, config);
		this.commandGroups.set(name, group);
	}

	removeCommandGroup(name) {
		this.commandGroups.delete(name);
		this.groupCooldowns.delete(name);
	}

	// --- Strategy Methods ---
	addStrategy(name, config) {
		const strategy = new Strategy(name, config);
		this.strategies.set(name, strategy);
		if (!this.currentStrategy) this.currentStrategy = strategy;
	}

	removeStrategy(name) {
		this.strategies.delete(name);
		if (this.currentStrategy?.name === name) {
			this.currentStrategy = this.strategies.values().next().value || null;
		}
	}

	setStrategy(name) {
		if (!this.strategies.has(name)) return;
		this.currentStrategy = this.strategies.get(name);
		this.lastStrategySwitch = Date.now();
		this._updateStats('strategyUsage', name);
	}

	// --- Core Logic ---
	generateMessage() {
		if (this.globalCooldown < 100) this.globalCooldown = 100;
		const now = Date.now();
		if (now - this.lastMessageTime < this.globalCooldown) return null;

		this._maybeSwapStrategy(now);
		if (!this.currentStrategy) return null;

		const available = this._getAvailableGroups(now);
		if (!available.length) return null;

		const selectedGroups = this._selectGroups(available);
		if (!selectedGroups.length) return null;

		const keywords = this._selectKeywords(selectedGroups);
		if (!keywords.length) return null;

		const msg = this._constructMessage(keywords, selectedGroups);
		this._updateStateAfterMessage(msg, now);

		return {
			text: msg.text,
			keywords: msg.keywords,
			strategy: msg.strategy,
		};
	}

	_maybeSwapStrategy(now) {
		if (!this.currentStrategy) return;
		const elapsed = now - this.lastStrategySwitch;
		if (elapsed < this.globalStrategyMinTime || elapsed < this.currentStrategy.minTime) return;

		const candidates = [...this.strategies.values()].filter(s => {
			const last = this.strategyCooldowns.get(s.name) || 0;
			return now - last >= s.cooldown;
		});
		if (!candidates.length) return;

		const pick = this._normalizedWeightedSelect(
			candidates.map(s => ({ item: s, weight: s.switchWeight }))
		);
		if (!pick) return;

		this.strategyCooldowns.set(this.currentStrategy.name, now);
		this.setStrategy(pick.name);
	}

	_getAvailableGroups(now) {
		return Array.from(this.commandGroups.values())
			.filter(g => (now - (this.groupCooldowns.get(g.name) || 0) >= g.cooldown))
			.map(g => ({ group: g, weight: this.currentStrategy.getGroupWeight(g.name) }))
			.filter(entry => entry.weight > 0);
	}

	_selectGroups(available) {
		const count = this._randomBetween(this.currentStrategy.minGroups, this.currentStrategy.maxGroups);
		const chosen = [];
		let pool = [...available];

		for (let i = 0; i < count && pool.length; i++) {
			const pick = this._normalizedWeightedSelect(
				pool.map(e => ({ item: e, weight: e.weight }))
			);
			if (!pick) break;
			chosen.push(pick);
			pool = pool.filter(e => e !== pick);
		}

		return chosen;
	}

	_selectKeywords(groups) {
		const result = [];
		for (const { group } of groups) {
			const want = this._randomBetween(group.minKeywords, group.maxKeywords);
			let pool = [...group.keywords];
			for (let i = 0; i < want && pool.length; i++) {
				const pick = this._normalizedWeightedSelect(
					pool.map(k => ({
						item: k,
						weight: group.getKeywordWeight(k)
					}))
				);
				result.push(pick);
				pool = pool.filter(k => k !== pick);
			}
		}
		return result;
	}

	_constructMessage(keywords, groups) {
		const text = keywords.join(' ');
		return {
			text,
			keywords: [...keywords],
			groups: groups,
			strategy: this.currentStrategy.name,
		};
	}

	_updateStateAfterMessage(msg, now) {
		this.lastMessage = msg.text;
		this.lastMessageTime = now;
		this.stats.messagesGenerated++;

		for (const groupName of msg.groups) {
			this.groupCooldowns.set(groupName, now);
			this._updateStats('groupUsage', groupName);
		}

		for (const keyword of msg.keywords) {
			this._updateStats('keywordUsage', keyword);
		}
	}

	// --- Utility ---
	_normalizedWeightedSelect(items) {
		if (!items.length) return null;
		const total = items.reduce((sum, x) => sum + x.weight, 0);
		let rnd = Math.random() * total;
		for (const { item, weight } of items) {
			rnd -= weight;
			if (rnd <= 0) return item;
		}
		return items[items.length - 1].item;
	}

	_randomBetween(min, max) {
		return Math.floor(Math.random() * (max - min + 1)) + min;
	}

	_updateStats(category, key) {
		const map = this.stats[category];
		map.set(key, (map.get(key) || 0) + 1);
	}

	// --- Status & Config ---
	getStatus() {
		return {
			lastMessage: this.lastMessage,
			currentStrategy: this.currentStrategy?.name || 'None',
			totalGroups: this.commandGroups.size,
			totalStrategies: this.strategies.size,
			messagesGenerated: this.stats.messagesGenerated,
			cooldownsActive: {
				global: Math.max(0, this.globalCooldown - (Date.now() - this.lastMessageTime)),
				groups: Array.from(this.groupCooldowns.entries())
					.map(([name, t]) => ({
						name,
						remaining: Math.max(0, (this.commandGroups.get(name)?.cooldown || 0) - (Date.now() - t))
					}))
					.filter(c => c.remaining > 0)
			}
		};
	}

	exportConfig() {
		return {
			commandGroups: Array.from(this.commandGroups.values()).map(g => g.exportConfig()),
			strategies: Array.from(this.strategies.values()).map(s => s.exportConfig()),
			currentStrategyName: this.currentStrategy?.name,
			globalSettings: {
				globalCooldown: this.globalCooldown,
				globalStrategyMinTime: this.globalStrategyMinTime,
			}
		};
	}

	importConfig(config) {
		this.commandGroups.clear();
		this.strategies.clear();
		if (config.commandGroups) config.commandGroups.forEach(c => this.addCommandGroup(c.name, c));
		if (config.strategies) config.strategies.forEach(s => this.addStrategy(s.name, s));
		if (config.currentStrategyName) this.setStrategy(config.currentStrategyName);
		if (config.globalSettings) Object.assign(this, config.globalSettings);
	}
}

class CommandGroup {
	constructor(name, config = {}) {
		this.name = name;
		this.cooldown = config.cooldown || 0;
		this.minKeywords = config.minKeywords || 1;
		this.maxKeywords = config.maxKeywords || 1;
		this.keywords = config.keywords || []; // Array of strings
		this.keywordWeights = new Map(); // keyword -> weight

		// Initialize keyword weights if provided
		if (config.keywordWeights) {
			if (config.keywordWeights instanceof Map) {
				this.keywordWeights = new Map(config.keywordWeights);
			} else {
				this.keywordWeights = new Map(Object.entries(config.keywordWeights));
			}
		}
	}

	addKeyword(text, weight = 1) {
		if (!this.keywords.includes(text)) {
			this.keywords.push(text);
		}
		this.keywordWeights.set(text, weight);
	}

	removeKeyword(text) {
		this.keywords = this.keywords.filter(k => k !== text);
		this.keywordWeights.delete(text);
	}

	setKeywordWeight(keyword, weight) {
		if (this.keywords.includes(keyword)) {
			this.keywordWeights.set(keyword, weight);
		}
	}

	getKeywordWeight(keyword) {
		return this.keywordWeights.get(keyword) || 1;
	}

	exportConfig() {
		return {
			name: this.name,
			cooldown: this.cooldown,
			minKeywords: this.minKeywords,
			maxKeywords: this.maxKeywords,
			keywords: this.keywords,
			keywordWeights: Object.fromEntries(this.keywordWeights)
		};
	}
}

class Strategy {
	constructor(name, config = {}) {
		this.name = name;
		this.minTime = config.minTime || 10000;
		this.cooldown = config.cooldown || 5000;
		this.switchWeight = config.switchWeight || 1;
		this.minGroups = config.minGroups || 1;
		this.maxGroups = config.maxGroups || 1;

		this.groupWeights = new Map(); // groupName -> weight

		if (config.groups) {
			Object.entries(config.groups).forEach(([groupName, weight]) => {
				this.setGroupWeight(groupName, weight);
			});
		}
	}

	setGroupWeight(groupName, weight) {
		this.groupWeights.set(groupName, weight);
	}

	removeGroup(groupName) {
		this.groupWeights.delete(groupName);
	}

	getGroupWeight(groupName) {
		return this.groupWeights.get(groupName) || 0;
	}

	exportConfig() {
		return {
			name: this.name,
			minTime: this.minTime,
			cooldown: this.cooldown,
			switchWeight: this.switchWeight,
			minGroups: this.minGroups,
			maxGroups: this.maxGroups,
			groups: Object.fromEntries(this.groupWeights)
		};
	}
}

export { Bot, CommandGroup, Strategy };