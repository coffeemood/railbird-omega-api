/* eslint-disable max-len */
const hha = require('hha');
const hhp = require('hhp');

const actions = [ 'raise', 'call', 'check', 'fold', 'R', 'C', 'X', 'F', 'bet', 'B' ];

// Get action short-hand
const shortHand = (action) => {
  switch (action) {
  case 'F':
  case 'fold':
    return 'F';
  case 'call':
    return 'C';
  case 'raise':
    return 'R';
  case 'check':
    return 'X';
  case 'bet':
    return 'B';
  default:
    return '';
  }
};

// Get pot types
const getPotType = (preflopActions, actionScript) => {
  const preflopRaises = preflopActions.filter((action) => action.type === 'raise');
  const isAIPF = actionScript.some((s) => s.street === 'preflop' && s.action && s.action.allin);
  if (isAIPF) return 'aipf';
  const isWalk = preflopActions.every((a) => a.type === 'folds');
  if (isWalk) return 'walk';
  switch (preflopRaises.length) {
  case 0:
    return 'limped';
  case 1:
    return 'srp';
  case 2:
    return '3bp';
  case 3:
    return '4bp';
  default:
    return '5bp+';
  }
};

// Get whether hero saw street
const sawStreet = (script, heroSeatIndex) => {
  const sawFlop = script.findIndex((a) => a.playerIndex === heroSeatIndex && a.street === 'flop') !== -1;
  const sawTurn = script.findIndex((a) => a.playerIndex === heroSeatIndex && a.street === 'turn') !== -1;
  const sawRiver = script.findIndex((a) => a.playerIndex === heroSeatIndex && a.street === 'river') !== -1;
  const sawShowdown = script.findIndex((a) => a.playerIndex === heroSeatIndex && a.street === 'showdown') !== -1;
  return {
    sawFlop,
    sawTurn,
    sawRiver,
    sawShowdown,
  };
};

// Get 3BP, 4BP, 5BP+ if hero is the aggressor
const getHeroPreflopBet = (potType, preflopActions, isVPIP, heroPos) => {
  const isHero2B = !!(potType === '2bp' && preflopActions.filter((a) => a.type === 'raise' && isVPIP).findIndex((a) => a.pos === heroPos) === 0);
  const isHero3B = !!(potType === '3bp' && preflopActions.filter((a) => a.type === 'raise' && isVPIP).findIndex((a) => a.pos === heroPos) === 1);
  const isHero4B = !!(potType === '4bp' && preflopActions.filter((a) => a.type === 'raise' && isVPIP).findIndex((a) => a.pos === heroPos) === 2);
  const isHero5B = !!(potType === '5bp' && preflopActions.filter((a) => a.type === 'raise' && isVPIP).findIndex((a) => a.pos === heroPos) === 3);
  return {
    isHero2B,
    isHero3B,
    isHero4B,
    isHero5B,
  };
};

const processHands = (hands) => {
  const parsed = hhp.parseHands(hands);
  const formatted = parsed.parsedHands.map((hand, index) => {
    const analyzed = hha(hand);
    const script = hha.script(analyzed);
    const summary = hha.summary(script);
    const { info } = analyzed;
    const {
      header,
      spoilers,
      seats,
      preflopActions,
      preflopSummary,
      flopSummary,
      turnSummary,
      riverSummary,
      totalPot,
    } = summary;

    // Get action script to be browsed later
    const actionScript = Object.keys(script.actions).reduce((acc, street) => {
      const streetActions = script.actions[street];
      return [ ...acc, streetActions.map((action) => ({
        ...action,
        street,
      })) ];
    }, []).flat();

    // Add new street actions (for replay purposes)
    [ 'preflop', 'flop', 'turn', 'river', 'showdown' ].forEach((street) => {
      const exist = actionScript.findIndex((action) => action.street === street);
      if (exist >= 0) {
        actionScript.splice(exist, 0, { isNewStreet: true, street });
      }
    });

    /* Generic hand info for filtering */
    // Eff stack is how much hero is effectively playing for against the table
    const effStack = Math.min(
      summary.seats.find((s) => s.hero).chipsBB,
      Math.max(...summary.seats.filter((s) => !s.hero).map((s) => s.chipsBB)),
    );
    const potType = getPotType(preflopActions, actionScript);
    const heroSeatIndex = seats.findIndex((s) => s.hero);
    const heroPos = seats.find((s) => s.hero).pos;
    const hasHero = preflopActions.find((a) => a.pos === heroPos);
    const isVPIP = !!(hasHero && hasHero.type !== 'check');
    const isPFR = !!(hasHero && hasHero.type === 'raise');

    // Hero aggression info preflop
    const {
      isHero2B,
      isHero3B,
      isHero4B,
      isHero5B,
    } = getHeroPreflopBet(potType, preflopActions, isVPIP, heroPos);

    // Hero did see flop turn river
    const {
      sawFlop,
      sawTurn,
      sawRiver,
      sawShowdown,
    } = sawStreet(actionScript, heroSeatIndex);

    // Summary of players' chips before and after the hand
    const playerChips = script.players.map((p) => ({
      pos: p.exactPos.toUpperCase(),
      name: p.name,
      chips: +p.chips.toFixed(2),
      chipsAfter: +p.chipsAfter.toFixed(2),
      bb: +(p.chips / summary.header.bb).toFixed(2),
      bbAfter: +(p.chipsAfter / summary.header.bb).toFixed(2),
      winLoss: +(p.chipsAfter - p.chips).toFixed(2),
      winLossBB: +((p.chipsAfter - p.chips) / summary.header.bb).toFixed(2),
      hero: seats.find((s) => s.hero).pos === p.exactPos.toUpperCase(),
    }));

    const formattedPosts = hand.posts.map((p) => ({
      name: p.player,
      amount: p.amount,
      type: p.type,
      playerIndex: playerChips.findIndex((pl) => pl.name === p.player),
      chips: playerChips.find((pl) => pl.name === p.player).chips,
      chipsAfter: playerChips.find((pl) => pl.name === p.player).chips - p.amount,
    }));

    // Short hand of hero's action all postflop streets

    const heroPreflopActions = preflopActions.filter((a) => a.pos === seats.find((s) => s.hero).pos);
    let heroPreflopSummary;
    if (heroPreflopActions.length) {
      heroPreflopSummary = heroPreflopActions.reduce((a, c, i) => (i === 0 ? shortHand(c.type) : `${a}/${shortHand(c.type)}`), '');
    } else {
      heroPreflopSummary = preflopSummary.pos === 'BB' && !preflopActions.filter((a) => a.type === 'raise').length ? 'W' : 'F';
    }

    const getActionSummary = (a, c, i) => (i === 0 ? shortHand(c.action.type) : `${a}/${shortHand(c.action.type)}`);
    const getHeroActionByStreet = (s, street) => s.street === street && s.playerIndex === heroSeatIndex && actions.includes(s.action.type);
    const flopActions = actionScript.filter((s) => getHeroActionByStreet(s, 'flop'));
    const heroFlopSummary = flopActions.reduce(getActionSummary, '');
    const turnActions = actionScript.filter((s) => getHeroActionByStreet(s, 'turn'));
    const heroTurnSummary = turnActions.reduce(getActionSummary, '');
    const riverActions = actionScript.filter((s) => getHeroActionByStreet(s, 'river'));
    const heroRiverSummary = riverActions.reduce(getActionSummary, '');

    // Construct Processed Hand
    const current = {};
    current.preflopSummary = {
      ...preflopSummary,
      heroPreflopSummary,
    };
    current.flopSummary = {
      ...flopSummary,
      heroFlopSummary,
    };
    current.turnSummary = {
      ...turnSummary,
      heroTurnSummary,
    };
    current.riverSummary = {
      ...riverSummary,
      heroRiverSummary,
    };

    current.info = {
      potType,
      effStack,
      isVPIP,
      isPFR,
      heroPos,
      isHero2B,
      isHero3B,
      isHero4B,
      isHero5B,
      sawFlop,
      sawTurn,
      sawRiver,
      sawShowdown,
      heroSeatIndex,
    };

    current.notes = {
      summary: '',
      flopNote: '',
      turnNote: '',
      riverNote: '',
    };

    current.header = {
      ...info,
      ...header
    };
    current.actionScript = actionScript;
    current.playerChips = playerChips;
    current.totalPot = totalPot;
    // current.indexInCollection = index;
    current.spoilers = spoilers;
    current.posts = formattedPosts;

    return current;
  });
  return formatted;
};

module.exports = {
  processHands,
};
