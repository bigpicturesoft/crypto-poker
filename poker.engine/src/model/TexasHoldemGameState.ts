﻿import {PokerEvaluator } from "../poker-evaluator";
import { IPlayer } from "./table/IPlayer";
import { PlayerTableHandle } from "./table/PlayerTableHandle";
var _ = require('lodash');

export class TexasHoldemGameState {
    pots: GamePot[] = [];
    boardCards: string[];

    allocateWinners(): GamePotResult {
      let result = new GamePotResult();

      for (let pot of this.pots) {        
        result.potResults.push(this.getPotResult(pot));
      }
      
      return result;
    }

  playerMissionStats(players: IPlayer[]): void {
    let hand, handFlop, handTurn, rankFlop, rankTurn, isFlop = false, isTurn = false, flopCards, turnCards, boardCards;

    this.boardCards ? boardCards = this.boardCards.length : boardCards = 0;

    boardCards > 2 ? isFlop = true : isFlop = false;
    boardCards > 3 ? isTurn = true : isTurn = false;
    isFlop ? flopCards = [this.boardCards[0], this.boardCards[1], this.boardCards[2]] : flopCards = null;
    isTurn ? turnCards = [this.boardCards[0], this.boardCards[1], this.boardCards[2], this.boardCards[3]] : turnCards = null;

    let handResult, flopResult, turnResult;
    for (let counter = 0; counter < players.length; counter++) {
      if (boardCards > 0) {
        players[counter].missionData = { score: 0, flopScore: 0, turnScore: 0, rank: 0, turnRank: 0, flopRank: 0 };
        hand = this.boardCards.concat(players[counter].holecards);
        isFlop ? handFlop = flopCards.concat(players[counter].holecards) : handFlop = null;
        isTurn ? handTurn = turnCards.concat(players[counter].holecards) : handTurn = null;
        handResult = PokerEvaluator.rankHand(hand);
        isFlop ? flopResult = PokerEvaluator.rankHand(handFlop) : flopResult = null;
        isTurn ? turnResult = PokerEvaluator.rankHand(handTurn) : turnResult = null;
        // console.log(players[counter]);
        // console.log(handResult);
        console.log(`Hand: ${players[counter].holecards} Hand Value: ${handResult.handRankEnglish}, Best Hand Cards, ${handResult.bestHandCards} Score: ${handResult.score}`);
        isFlop ? console.log(`Hand: ${players[counter].holecards} Hand Value Flop: ${flopResult.handRankEnglish}, Best Hand Cards, ${flopResult.bestHandCards} Score: ${flopResult.score}`) : console.log("no flop");
        // players[counter].flopScore = flopResult.score
        //  players[counter].score = handResult.score
        isFlop ? players[counter].missionData.flopScore = flopResult.score : players[counter].missionData.flopScore = null;
        isTurn ? players[counter].missionData.turnScore = turnResult.score : players[counter].missionData.turnScore = null;
        players[counter].missionData.score = handResult.score;
        players[counter].missionData.rank = handResult.handRank;
        isFlop ? players[counter].missionData.flopRank = flopResult.handRank : players[counter].missionData.flopRank;
        isTurn ? players[counter].missionData.turnRank = turnResult.handRank : players[counter].missionData.turnRank;
      } else {
        players[counter].missionData = { score: null, flopScore: null, turnScore: null, rank: null, turnRank: null, flopRank: null };
      }
    }
  }

    allocatePots(players: IPlayer[]) : void {
      this.playerMissionStats(players);
      let filteredPlayers = players.filter(p => p.cumulativeBet > 0);
      let groups = _.groupBy(filteredPlayers, (p: IPlayer) => p.cumulativeBet);
      let sortedKeys = _.keys(groups).sort((k1: number, k2: number) => { return k1 - k2; });
      //console.log('sortedKeys', sortedKeys);
      let pots: GamePot[] = [];
      let potIndex = 0;
      for (let amountStr of sortedKeys) {
        let amount = parseFloat(amountStr);        

        let pot = new GamePot();
        for (let player of filteredPlayers) {
          if (player.cumulativeBet >= amount) {
            pot.players.push(player);
          }
        }

        let potAmount = amount - (potIndex > 0 ? sortedKeys[potIndex - 1] : 0);
        pot.amount = potAmount * pot.players.length;

        pots.push(pot);
        potIndex++;
      }

      //keep track of how many players (including those who have folded) in each pot before we merge
      let playerCounts = pots.map(p=>p.players.length);      
      let playersWhoCanWinFunc  = (p:IPlayer):boolean=> !p.hasFolded && p.holecards && p.holecards.length > 0;
      //remove players that have folded or arent playing (but paid blinds)
      let potsWithNoPlayers:GamePot[] = [];
      for (let pot of pots.slice()){
        pot.players = pot.players.filter(playersWhoCanWinFunc);
        if(pot.players.length == 0){
          potsWithNoPlayers.push(pot);
          pots.splice(pots.indexOf(pot), 1);
        }
      }
        
      if(pots.length==0){
        let pot = new GamePot();
        pot.amount = 0;
        pot.players = players.filter(playersWhoCanWinFunc);
        pots.push(pot);
      }
      
      //merge pots that have folded players
      //dont merge the pot with 1 player nor merge *into* the pot with one player. this is because this pot is the excess that the last player bet
      //and needs to be kept separate as the rake should not be calculated on this pot
      for (let pot of pots.slice()) {
        if (playerCounts[pots.indexOf(pot)] === 1)
          continue;
        let moveToPot = this.getPotWithSamePlayers(pots, pot);
        let tmpIndex = pots.indexOf(moveToPot);
        if (moveToPot != null && playerCounts[tmpIndex] > 1) {
          pots.splice(pots.indexOf(pot), 1);
          moveToPot.amount += pot.amount;
        }
      }

      //add pots with no players onto the last pot
      if(potsWithNoPlayers.length){
        for(let pot of potsWithNoPlayers){          
          let potsWithPlayers = pots.filter(p=>p.players.length > 0);
          if(potsWithPlayers.length){
            let lastPotWithPlayers:GamePot = potsWithPlayers[potsWithPlayers.length-1];          
            lastPotWithPlayers.amount += pot.amount;
          }else{
            
          }
          
        }        
      }
      


      this.pots = pots;
    }

    getPotWithSamePlayers(pots: GamePot[], thisPot: GamePot):GamePot {
      for (let pot of pots) {
      if(pot===thisPot)
        continue;
        if (pot.players.length == thisPot.players.length) {
        let allMatch = false;
        for (let player of pot.players) {
          if (!thisPot.players.find(p => p === player)) {
            allMatch = false;
            break;
          }
          return pot;
        }
      }
      }

      return null;
    }

    getPotResult(pot: GamePot): PotResult {
      let potResult = new PotResult();
      //console.log('calculating pot: ' + pot.amount + ' pot.players.length: ' + pot.players.length)
      let i = 0;
      let maxScore: number = 0;
      let maxRank: number = 0;
      let winners: HandEvaluatorResult[] = [];
      let remainingPlayers = pot.players.filter(p => !p.hasFolded  && p.holecards && p.holecards.length);
      
      if (remainingPlayers.length == 1) {        
        winners.push(new HandEvaluatorResult(remainingPlayers[0]));
      } else {
        for (let player of remainingPlayers) {
          let hand = this.boardCards.concat(player.holecards);
          let handResult = PokerEvaluator.rankHand(hand);
          handResult.player = player;
          potResult.playerHandEvaluatorResults.push(handResult);
          //console.log('handResult: ', handResult);
          if (handResult.handRank > maxRank) {
            maxRank = handResult.handRank;
            maxScore = handResult.score;
          } else if (handResult.handRank === maxRank) {
            maxScore = Math.max(maxScore, handResult.score);
          }
          i++;
        }
        winners = potResult.playerHandEvaluatorResults.filter((r: HandEvaluatorResult) => r.handRank === maxRank && r.score === maxScore);
      }
      
      if (!winners.length) {
        throw new Error(`no winners: ${JSON.stringify(pot)}`);
      }
        

      let winAmount = Math.floor(pot.amount / winners.length);
      
      for (let evalResult of winners) {
        let r = new PlayerAllocationResult();
        r.player = evalResult.player;
        r.amount = winAmount;
        potResult.allocations.push(r);
      }
      return potResult;
    }
}

export class GamePot {
    amount: number;
    players: IPlayer[] = [];
}

export class GamePotResult {
  potResults: PotResult[] = [];      
}

export class PotResult {
  allocations: PlayerAllocationResult[] = [];  
  playerHandEvaluatorResults: HandEvaluatorResult[] = [];
}

export class PlayerAllocationResult {
  player: IPlayer;
  amount:number;
}

export class HandEvaluatorResult {
  constructor(player: IPlayer) { this.player=player}
  bestHand: string;
  bestHandCards: string[] = [];
  handRank: number;
  handRankEnglish: string;
  score: number;
  player: IPlayer;  
}