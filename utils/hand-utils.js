
const {
  evaluateDraw, getBestHand, getFlopType, getIsPaired, getFlopArchetype
} = require('./solver');

function convertHandHistoryToText(hand) {
    const {
      header, preflopSummary, players, playerChips, info, posts
    } = hand;
  
    // Add ante calculation
    const formatBB = (amount) => (amount / header.bb).toFixed(1);
    const ante = posts?.find(p => p.type === 'ante')?.amount || 0;
    const anteText = ante ? ` | Ante ${ante}` : '';
  
    const hero = playerChips.find(p => p.hero);
    const getInvolvedPlayers = (hand) => {
      const activeIndices = new Set();
      hand.actionScript.forEach(action => {
        if (!action.isNewStreet && action.action.type !== 'fold') {
          activeIndices.add(action.playerIndex);
        }
      });
      return Array.from(activeIndices)
        .map(i => hand.playerChips[i])
        .filter(p => !p.hero);
    };
  
    const involvedPlayers = getInvolvedPlayers(hand);
  
    const formatBoard = (cards) => (Array.isArray(cards) ? cards.join(' ') : cards || '');
  
    const formatAction = (action) => {
      const actionVerbs = {
        raise: 'raises',
        bet: 'bets',
        call: 'calls',
        check: 'checks',
        fold: 'folds',
        'bet-returned': 'takes back',
        collect: 'collects',
      };
  
      const amount = action.amount ? ` ${formatBB(action.amount)}BB` : '';
      const allinText = action.allin ? ' and is all-in' : '';
      return `${actionVerbs[action.type]}${amount}${allinText}`;
    };
  
    const getStackDetails = (hero, villains, street = 'preflop') => {
      // Get stacks for the specific street by tracking previous actions
      const streets = [ 'preflop', 'flop', 'turn', 'river' ];
      const getStackAtStreet = (player) => {
        const actions = hand.actionScript
          .filter(a => streets.indexOf(a.street) < streets.indexOf(street) // Only consider previous streets
            && a.playerIndex === playerChips.findIndex(p => p.pos === player.pos));
  
        // Calculate remaining stack by subtracting all previous bets/calls
        const stackChange = actions.reduce((total, action) => {
          // Only subtract amounts for bets, raises, and calls
          const amount = [ 'bet', 'raise', 'call' ].includes(action.action.type) ? (action.action.amount || 0) : 0;
          return total - amount;
        }, player.chips);
  
        return formatBB(Math.max(0, stackChange)); // Ensure stack doesn't go negative
      };
  
      const heroStack = `Hero: ${getStackAtStreet(hero)}BB`;
      const villainStacks = villains.map(v => `${v.pos}: ${getStackAtStreet(v)}BB`);
      return [ heroStack, ...villainStacks ].join(' | ');
    };
  
    const getHeroHandArchetype = () => {
      const { card1 } = preflopSummary.cards;
      const { card2 } = preflopSummary.cards;
      const [ card1Rank, card1Suit ] = card1.split('');
      const [ card2Rank, card2Suit ] = card2.split('');
      if (card1Rank === card2Rank) {
        return 'Pair';
      } if (card1Suit === card2Suit) {
        return 'Suited';
      }
      return 'Offsuit';
    };
  
    const getActionSummary = (hand) => {
      const streets = [ 'preflop', 'flop', 'turn', 'river' ];
      let currentBoard = [];
      const strengthInfo = '';
  
      return streets
        .filter(street => street === 'preflop' || hand[`${street}Summary`].playersInvolved)
        .map(street => {
          // Calculate hand strength
          let strengthInfo = '';
  
          const streetSummary = hand[`${street}Summary`];
          const streetCards = street === 'flop' ? (streetSummary.board || []) : [ streetSummary.board || '' ];
          // Accumulate board cards for each street
          if (street === 'flop') {
            currentBoard = streetCards;
            // Add board texture analysis for flop
            const flopString = currentBoard.join('');
            const boardType = getFlopType(flopString);
            const isPaired = getIsPaired(flopString);
            const archetype = getFlopArchetype(flopString);
            strengthInfo = `\nBoard Type: ${boardType} | ${isPaired} | ${archetype}`;
          } else if (street === 'turn' || street === 'river') {
            currentBoard = [ ...currentBoard, ...streetCards ];
          }
  
          const pot = formatBB(streetSummary.pot);
          const heroCards = [ preflopSummary.cards.card1, preflopSummary.cards.card2 ];
  
          if (street !== 'preflop' && currentBoard.length > 0) {
            // For flop, evaluate draws
            if (street === 'flop') {
              const flop = currentBoard.map(card => [ card[0], card[1] ]); // Split cards into rank/suit
              const draw = evaluateDraw(
                heroCards.join(''), // Convert hero cards to string format
                flop
              );
              if (draw !== 'No Draw') {
                strengthInfo += `\nDraw: ${draw}`;
              }
            }
  
            // Get made hand strength using accumulated board
            const allCards = [ ...heroCards, ...currentBoard ];
            // console.log(allCards);
            const bestHand = getBestHand(allCards);
            strengthInfo += `\nMade Hand: ${bestHand}`;
          }
  
          const actions = hand.actionScript
            .filter(a => a.street === street && !a.isNewStreet)
            .map(a => {
              const player = hand.playerChips[a.playerIndex];
              const playerName = player.hero ? 'Hero' : player.pos;
              return `${playerName} ${formatAction(a.action)}`;
            });
  
          const streetName = street.charAt(0).toUpperCase() + street.slice(1);
          const potSize = Number.isNaN(pot) ? 0 : pot;
          // Add stack updates per street
          const stackInfo = `\nStacks: ${getStackDetails(hero, involvedPlayers, street)}`;
          return `${streetName} [${formatBoard(currentBoard)}] (${potSize}BB): Hero has - ${strengthInfo}${stackInfo}\n${actions.join('\n')}`;
        })
        .join('\n\n');
    };
  
    return `This NLHE hand (${info.effStack}BB effective):

  Blinds: SB ${header.sb}/BB ${header.bb}${anteText}
  Stacks: ${getStackDetails(hero, involvedPlayers)} | ${players.length} players
  Context: ${header.gametype}
  Hero Hand: ${preflopSummary.cards.card1}, ${preflopSummary.cards.card2} ${getHeroHandArchetype()}
  Hero Position: ${info.heroPos}
  
  ${getActionSummary(hand)}
  
  To remind you, Hero has ${preflopSummary.cards.card1} ${preflopSummary.cards.card2} ${getHeroHandArchetype()}`;
  }

  module.exports = {
    convertHandHistoryToText
  };