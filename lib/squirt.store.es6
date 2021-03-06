import _ from 'lodash';
// import Listener, Publisher from 'reflux';
import NylasStore from 'nylas-store';

export default class SquirtStore extends NylasStore {
  constructor() {
    super();

    this._state = {};

    this.maxWpm = 1000;
    this.minWpm = 200;
    this.wpmStep = 20;
    // Minimum length to display reader in # of words
    // Default is set to zero,
    // User will eventually set through a settings page
    this.threshold = 0;
    this.defaultWpm = 300;
    this.showErrors = true;
    // Words per minute
    this.wpm = this.defaultWpm;
    this.nextNodeTimeoutId = null;
    this.paused = true;
    this.nodes = [];
    this.lastNode = {};
    this.lastNodeIndex = 0;
    this.nodeIndex = 0;
    this.jumped = false;

    // /////////////////////////////////////////////////////////////////////////
    // Constants for delay calculations
    // /////////////////////////////////////////////////////////////////////////
    this.waitAfterShortWord = 1.2;
    this.waitAfterComma = 2;
    this.waitAfterPeriod = 3;
    this.waitAfterParagraph = 3.5;
    this.waitAfterLongWord = 1.5;
    this.salutations = {
      'Mr.': true,
      'Mrs.': true,
      'Ms.': true,
      'Mx.': true,
    };
    this.setWpm(this.wpm);
  }

  init(state) {
    this.defaultWpm = state.defaultWpm || this.defaultWpm;
    this.threshold = state.threshold || this.threshold;
    this.showErrors = state.showErrors != undefined ? state.showErrors : this.showErrors;
  }

  serialize() {
    return {
      defaultWpm: this.defaultWpm,
      threshold: this.threshold,
      showErrors: this.showErrors,
    };
  }

  play() {
    this.paused = false;
    this.trigger('squirt.play');
    this._nextNode();
  }

  pause() {
    this.paused = true;
    clearTimeout(this.nextNodeTimeoutId);
    this.trigger('squirt.pause');
  }

  jump(index) {
    this.jumped = true;
    this.nodeIndex = index;
    this.trigger('squirt.jumped');
  }

  //
  // restart() {
  //
  // }
  //
  // rewind() {
  //
  // }

  getWpm() {
    return _.clone(this.wpm);
  }

  getMaxWpm() {
    return _.clone(this.maxWpm);
  }

  getMinWpm() {
    return _.clone(this.minWpm);
  }

  getDefaultWpm() {
    return _.clone(this.defaultWpm);
  }

  setDefaultWpm(newDefaultWpm) {
    this.defaultWpm = newDefaultWpm;
  }

  getThreshold() {
    return _.clone(this.threshold);
  }

  setThrehold(newThreshold) {
    this.threshold = newThreshold;
  }

  setShowErrors(newShowErrors) {
    this.showErrors = newShowErrors;
  }

  getShowErrors() {
    return _.clone(this.showErrors);
  }

  isBelowThreshold() {
    return this.getNumberOfNodes() < this.threshold;
  }

  getNumberOfNodes() {
    return _.get(this, 'nodes.length', 0);
  }

  getCurrentIndex() {
    return _.get(this, 'nodeIndex');
  }

  setWpm(wpm) {
    this.wpm = wpm;
    // 60 seconds * 1000 milliseconds / words per minute
    this.intervalMilliseconds = 60 * 1000 / wpm;
    this.trigger('squirt.updateWpm', this.getWpm());
  }

  incrementWpm() {
    if (this.wpm >= this.maxWpm) {
      return;
    }
    this.setWpm(this.wpm + this.wpmStep);
  }

  decrementWpm() {
    if (this.wpm <= this.minWpm) {
      return;
    }
    this.setWpm(this.wpm - this.wpmStep);
  }

  setNodes(nodes) {
    if (!nodes.length) {
      throw new Error('No text nodes created');
    }
    this.nodes = nodes;
    this.lastNode = {};
    this.lastNodeIndex = 0;
    this.nodeIndex = 0;
    this.trigger('squirt.ready');
  }

  getRunTime() {
    return _.reduce(this.nodes, (time, node) => {
      return time + (this.intervalMilliseconds * this._getDelay(node));
    }, 0);
  }

  getRunTimeString() {
    const runTime = this.getRunTime();
    const second = 1000;
    const minute = second * 60;
    // minutes
    if (runTime >= minute) {
      const minutes = runTime / minute;
      return _.round(minutes, 2) + ' mins';
    }
    // seconds
    const seconds = runTime / second;
    return _.round(seconds) + ' secs';
  }
  clearTimeouts() {
    clearTimeout(this.nextNodeTimeoutId);
  }

  _getDelay(node, jumped) {
    const word = node.word;
    // If jumped to position, give longest delay to allow for readjustment
    if (jumped) return this.waitAfterPeriod;
    if (_.get(this.salutations[word])) return 1;
    let lastChar = word[word.length - 1];
    // Ignore
    if (lastChar.match('”|"')) lastChar = word[word.length];
    // Paragraph
    if (lastChar === '\n') return this.waitAfterParagraph;
    // Peroid length pause
    if ('.!?'.indexOf(lastChar) !== -1) return this.waitAfterPeriod;
    // Comma length pause
    if (',;:–'.indexOf(lastChar) !== -1) return this.waitAfterComma;
    // Short Word
    if (word.length < 4) return this.waitAfterShortWord;
    // Long Word
    if (word. length > 11) return this.waitAfterLongWord;
    // Default to 1
    return 1;
  }

  _incrementNodeIndex(increment) {
    const returnValue = this.nodeIndex;
    this.nodeIndex += increment || 1;
    this.nodeIndex = Math.max(0, this.nodeIndex);
    return returnValue;
  }

  _nextNode() {
    const nextIndex = this._incrementNodeIndex();
    if (nextIndex > this.nodes.length) {
      this.trigger('squirt.finalWord');
      return;
    }
    this.trigger('squirt.nextWord', this.lastNode);
    this.lastNode = this.nodes[nextIndex];

    if (this.paused || !this.lastNode) return;

    const delay = this.intervalMilliseconds * this._getDelay(this.lastNode, this.jumped);
    this.jumped = false;
    this.nextNodetimeoutId = setTimeout(this._nextNode.bind(this), delay);
    return;
  }

  calcNodeOffsets(node) {
    if (node.children.length !== 3) {
      console.log('Unexpected number of node children:', node);
    }
    // Get  width of start ORP
    const startWidth = node.children[0].getBoundingClientRect().width;
    const ORPWidth = node.children[1].getBoundingClientRect().width;
    // start width + ORP/2 = offset
    // plus a fiddle-factor (ff)
    const ff = 1;
    const offset = startWidth + Math.floor(ORPWidth / 2) + ff;
    this.trigger('squirt.offset', -offset);
    return;
  }

}

export default new SquirtStore();
