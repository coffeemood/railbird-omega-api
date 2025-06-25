const LEVELS = {
  1: {
    title: 'Rookie',
    description: 'Welcome to Railbird! You\'re taking your very first steps in the poker world. Upload your first hand to get started!',
    requirements: {
      handsUploaded: 0,
      handsAnalyzed: 0,
      posts: 0,
    },
    xpRequired: 0,
  },
  2: {
    title: 'Amateur',
    description: 'You\'re beginning to grasp the basics. Keep uploading and analyzing hands to sharpen your instincts.',
    requirements: {
      handsUploaded: 10,
      handsAnalyzed: 5,
      posts: 1,
    },
    xpRequired: 1000,
  },
  3: {
    title: 'Regular',
    description: 'You\'ve found your rhythm, and your understanding of the game is growing. Stay consistent and keep learning.',
    requirements: {
      handsUploaded: 50,
      handsAnalyzed: 25,
      posts: 5,
    },
    xpRequired: 2500,
  },
  4: {
    title: 'Grinder',
    description: 'You\'re putting in the hours and gaining valuable experience. Your dedication to improvement is clear.',
    requirements: {
      handsUploaded: 200,
      handsAnalyzed: 100,
      posts: 20,
    },
    xpRequired: 5000,
  },
  5: {
    title: 'Shark',
    description: 'Your confidence is rising. You\'ve honed your instincts and your opponents are taking notice!',
    requirements: {
      handsUploaded: 500,
      handsAnalyzed: 250,
      posts: 50,
    },
    xpRequired: 10000,
  },
  6: {
    title: 'High Roller',
    description: 'You\'re comfortable playing bigger pots, and your strategic thinking is on point. Keep aiming high!',
    requirements: {
      handsUploaded: 1000,
      handsAnalyzed: 500,
      posts: 100,
    },
    xpRequired: 20000,
  },
  7: {
    title: 'Card Sharp',
    description: 'You\'ve developed a keen eye for reading your opponents and dissecting hands. Your insights are sought after in the community.',
    requirements: {
      handsUploaded: 2000,
      handsAnalyzed: 1000,
      posts: 200,
    },
    xpRequired: 35000,
  },
  8: {
    title: 'Mastermind',
    description: 'Your strategic depth is impressive. You routinely make high-level decisions, and your analysis sets you apart.',
    requirements: {
      handsUploaded: 3500,
      handsAnalyzed: 1750,
      posts: 300,
    },
    xpRequired: 50000,
  },
  9: {
    title: 'Poker Scholar',
    description: 'You\'ve become a student of the game, combining theory and experience into a formidable skill set. Others look to you for guidance.',
    requirements: {
      handsUploaded: 5000,
      handsAnalyzed: 2500,
      posts: 500,
    },
    xpRequired: 75000,
  },

  // Newly Added Levels
  10: {
    title: 'Relentless Grinder',
    description: 'Your unwavering dedication is unstoppable. At this stage, you\'re a machine at the tables, outlasting the competition with your endurance.',
    requirements: {
      handsUploaded: 15000,
      handsAnalyzed: 7500,
      posts: 2000,
    },
    xpRequired: 150000,
  },
  11: {
    title: 'Omniscient Analyst',
    description: 'Your mastery of hand analysis is second to none. Every move you make has depth, precision, and an unshakable logic.',
    requirements: {
      handsUploaded: 25000,
      handsAnalyzed: 10000,
      posts: 3000,
    },
    xpRequired: 250000,
  },
  12: {
    title: 'Global Advisor',
    description: 'Players worldwide seek your strategic counsel. Your guidance transforms ordinary players into formidable contenders.',
    requirements: {
      handsUploaded: 40000,
      handsAnalyzed: 15000,
      posts: 5000,
    },
    xpRequired: 400000,
  },
  13: {
    title: 'Transcendent Icon',
    description: 'Your influence transcends the tables. When you speak, the entire poker community takes note, learning from your vast experience.',
    requirements: {
      handsUploaded: 60000,
      handsAnalyzed: 25000,
      posts: 7500,
    },
    xpRequired: 600000,
  },
  14: {
    title: 'Poker Immortal',
    description: 'You reside among the legends, an unstoppable force of skill and intellect. Your name will echo in poker history forever.',
    requirements: {
      handsUploaded: 100000,
      handsAnalyzed: 40000,
      posts: 10000,
    },
    xpRequired: 1000000,
  },
};

const calculateUserLevel = (stats) => {
  const { handsUploaded = 0, handsAnalyzed = 0, posts = 0 } = stats;

  // Calculate XP based on user activities
  const xp = (handsUploaded * 10) + (handsAnalyzed * 20) + (posts * 50);

  // Find current level
  let currentLevel = 1;
  let nextLevelXp = LEVELS[2].xpRequired;

  // eslint-disable-next-line no-restricted-syntax
  for (const [ level, data ] of Object.entries(LEVELS)) {
    if (xp >= data.xpRequired) {
      currentLevel = parseInt(level, 10);
      nextLevelXp = LEVELS[currentLevel + 1]?.xpRequired || data.xpRequired;
    } else {
      break;
    }
  }

  return {
    currentLevel,
    xp,
    nextLevelXp,
    levelData: LEVELS[currentLevel],
  };
};

module.exports = {
  LEVELS,
  calculateUserLevel
};
