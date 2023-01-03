/**
 * findAndReplaceDOMText v 0.4.6
 * @author James Padolsey http://james.padolsey.com
 * @license http://unlicense.org/UNLICENSE
 *
 * Matches the text of a DOM node against a regular expression
 * and replaces each match (or node-separated portions of the match)
 * in the specified element.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {  
      // Node/CommonJS
      module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
      // AMD. Register as an anonymous module.
      define(factory);
  } else {
      // Browser globals
      root.findAndReplaceDOMText = factory();
  }
}(this, function factory() {

 var PORTION_MODE_RETAIN = 'retain';
 var PORTION_MODE_FIRST = 'first';

 var doc = document;
 var hasOwn = {}.hasOwnProperty;

 function escapeRegExp(s) {
     return String(s).replace(/([.*+?^=!:${}()|[\]\/\\])/g, '\\$1');
 }

 function exposed() {
     // Try deprecated arg signature first:
     return deprecated.apply(null, arguments) || findAndReplaceDOMText.apply(null, arguments);
 }

 function deprecated(regex, node, replacement, captureGroup, elFilter) {
     if ((node && !node.nodeType) && arguments.length <= 2) {
         return false;
     }
     var isReplacementFunction = typeof replacement == 'function';

     if (isReplacementFunction) {
         replacement = (function(original) {
             return function(portion, match) {
                 return original(portion.text, match.startIndex);
             };
         }(replacement));
     }

     // Awkward support for deprecated argument signature (<0.4.0)
     var instance = findAndReplaceDOMText(node, {

         find: regex,

         wrap: isReplacementFunction ? null : replacement,
         replace: isReplacementFunction ? replacement : '$' + (captureGroup || '&'),

         prepMatch: function(m, mi) {

             // Support captureGroup (a deprecated feature)

             if (!m[0]) throw 'findAndReplaceDOMText cannot handle zero-length matches';

             if (captureGroup > 0) {
                 var cg = m[captureGroup];
                 m.index += m[0].indexOf(cg);
                 m[0] = cg;
             }

             m.endIndex = m.index + m[0].length;
             m.startIndex = m.index;
             m.index = mi;

             return m;
         },
         filterElements: elFilter
     });

     exposed.revert = function() {
         return instance.revert();
     };

     return true;
 }

 /**
  * findAndReplaceDOMText
  *
  * Locates matches and replaces with replacementNode
  *
  * @param {Node} node Element or Text node to search within
  * @param {RegExp} options.find The regular expression to match
  * @param {String|Element} [options.wrap] A NodeName, or a Node to clone
  * @param {String} [options.wrapClass] A classname to append to the wrapping element
  * @param {String|Function} [options.replace='$&'] What to replace each match with
  * @param {Function} [options.filterElements] A Function to be called to check whether to
  *	process an element. (returning true = process element,
  *	returning false = avoid element)
  */
 function findAndReplaceDOMText(node, options) {
     return new Finder(node, options);
 }

 exposed.NON_PROSE_ELEMENTS = {
     br:1, hr:1,
     // Media / Source elements:
     script:1, style:1, img:1, video:1, audio:1, canvas:1, svg:1, map:1, object:1,
     // Input elements
     input:1, textarea:1, select:1, option:1, optgroup: 1, button:1
 };

 exposed.NON_CONTIGUOUS_PROSE_ELEMENTS = {

     // Elements that will not contain prose or block elements where we don't
     // want prose to be matches across element borders:

     // Block Elements
     address:1, article:1, aside:1, blockquote:1, dd:1, div:1,
     dl:1, fieldset:1, figcaption:1, figure:1, footer:1, form:1, h1:1, h2:1, h3:1,
     h4:1, h5:1, h6:1, header:1, hgroup:1, hr:1, main:1, nav:1, noscript:1, ol:1,
     output:1, p:1, pre:1, section:1, ul:1,
     // Other misc. elements that are not part of continuous inline prose:
     br:1, li: 1, summary: 1, dt:1, details:1, rp:1, rt:1, rtc:1,
     // Media / Source elements:
     script:1, style:1, img:1, video:1, audio:1, canvas:1, svg:1, map:1, object:1,
     // Input elements
     input:1, textarea:1, select:1, option:1, optgroup:1, button:1,
     // Table related elements:
     table:1, tbody:1, thead:1, th:1, tr:1, td:1, caption:1, col:1, tfoot:1, colgroup:1

 };

 exposed.NON_INLINE_PROSE = function(el) {
     return hasOwn.call(exposed.NON_CONTIGUOUS_PROSE_ELEMENTS, el.nodeName.toLowerCase());
 };

 // Presets accessed via `options.preset` when calling findAndReplaceDOMText():
 exposed.PRESETS = {
     prose: {
         forceContext: exposed.NON_INLINE_PROSE,
         filterElements: function(el) {
             return !hasOwn.call(exposed.NON_PROSE_ELEMENTS, el.nodeName.toLowerCase());
         }
     }
 };

 exposed.Finder = Finder;

 /**
  * Finder -- encapsulates logic to find and replace.
  */
 function Finder(node, options) {

     var preset = options.preset && exposed.PRESETS[options.preset];

     options.portionMode = options.portionMode || PORTION_MODE_RETAIN;

     if (preset) {
         for (var i in preset) {
             if (hasOwn.call(preset, i) && !hasOwn.call(options, i)) {
                 options[i] = preset[i];
             }
         }
     }

     this.node = node;
     this.options = options;

     // Enable match-preparation method to be passed as option:
     this.prepMatch = options.prepMatch || this.prepMatch;

     this.reverts = [];

     this.matches = this.search();

     if (this.matches.length) {
         this.processMatches();
     }

 }

 Finder.prototype = {

     /**
      * Searches for all matches that comply with the instance's 'match' option
      */
     search: function() {

         var match;
         var matchIndex = 0;
         var offset = 0;
         var regex = this.options.find;
         var textAggregation = this.getAggregateText();
         var matches = [];
         var self = this;

         regex = typeof regex === 'string' ? RegExp(escapeRegExp(regex), 'g') : regex;

         matchAggregation(textAggregation);

         function matchAggregation(textAggregation) {
             for (var i = 0, l = textAggregation.length; i < l; ++i) {

                 var text = textAggregation[i];

                 if (typeof text !== 'string') {
                     // Deal with nested contexts: (recursive)
                     matchAggregation(text);
                     continue;
                 }

                 if (regex.global) {
                     while (match = regex.exec(text)) {
                         matches.push(self.prepMatch(match, matchIndex++, offset));
                     }
                 } else {
                     if (match = text.match(regex)) {
                         matches.push(self.prepMatch(match, 0, offset));
                     }
                 }

                 offset += text.length;
             }
         }

         return matches;

     },

     /**
      * Prepares a single match with useful meta info:
      */
     prepMatch: function(match, matchIndex, characterOffset) {

         if (!match[0]) {
             throw new Error('findAndReplaceDOMText cannot handle zero-length matches');
         }

         match.endIndex = characterOffset + match.index + match[0].length;
         match.startIndex = characterOffset + match.index;
         match.index = matchIndex;

         return match;
     },

     /**
      * Gets aggregate text within subject node
      */
     getAggregateText: function() {

         var elementFilter = this.options.filterElements;
         var forceContext = this.options.forceContext;

         return getText(this.node);

         /**
          * Gets aggregate text of a node without resorting
          * to broken innerText/textContent
          */
         function getText(node) {

             if (node.nodeType === Node.TEXT_NODE) {
                 return [node.data];
             }

             if (elementFilter && !elementFilter(node)) {
                 return [];
             }

             var txt = [''];
             var i = 0;

             if (node = node.firstChild) do {

                 if (node.nodeType === Node.TEXT_NODE) {
                     txt[i] += node.data;
                     continue;
                 }

                 var innerText = getText(node);

                 if (
                     forceContext &&
                     node.nodeType === Node.ELEMENT_NODE &&
                     (forceContext === true || forceContext(node))
                 ) {
                     txt[++i] = innerText;
                     txt[++i] = '';
                 } else {
                     if (typeof innerText[0] === 'string') {
                         // Bridge nested text-node data so that they're
                         // not considered their own contexts:
                         // I.e. ['some', ['thing']] -> ['something']
                         txt[i] += innerText.shift();
                     }
                     if (innerText.length) {
                         txt[++i] = innerText;
                         txt[++i] = '';
                     }
                 }
             } while (node = node.nextSibling);

             return txt;

         }

     },

     /**
      * Steps through the target node, looking for matches, and
      * calling replaceFn when a match is found.
      */
     processMatches: function() {

         var matches = this.matches;
         var node = this.node;
         var elementFilter = this.options.filterElements;

         var startPortion,
             endPortion,
             innerPortions = [],
             curNode = node,
             match = matches.shift(),
             atIndex = 0, // i.e. nodeAtIndex
             matchIndex = 0,
             portionIndex = 0,
             doAvoidNode,
             nodeStack = [node];

         out: while (true) {

             if (curNode.nodeType === Node.TEXT_NODE) {

                 if (!endPortion && curNode.length + atIndex >= match.endIndex) {
                     // We've found the ending
                     // (Note that, in the case of a single portion, it'll be an
                     // endPortion, not a startPortion.)
                     endPortion = {
                         node: curNode,
                         index: portionIndex++,
                         text: curNode.data.substring(match.startIndex - atIndex, match.endIndex - atIndex),

                         // If it's the first match (atIndex==0) we should just return 0
                         indexInMatch: atIndex === 0 ? 0 : atIndex - match.startIndex,

                         indexInNode: match.startIndex - atIndex,
                         endIndexInNode: match.endIndex - atIndex,
                         isEnd: true
                     };

                 } else if (startPortion) {
                     // Intersecting node
                     innerPortions.push({
                         node: curNode,
                         index: portionIndex++,
                         text: curNode.data,
                         indexInMatch: atIndex - match.startIndex,
                         indexInNode: 0 // always zero for inner-portions
                     });
                 }

                 if (!startPortion && curNode.length + atIndex > match.startIndex) {
                     // We've found the match start
                     startPortion = {
                         node: curNode,
                         index: portionIndex++,
                         indexInMatch: 0,
                         indexInNode: match.startIndex - atIndex,
                         endIndexInNode: match.endIndex - atIndex,
                         text: curNode.data.substring(match.startIndex - atIndex, match.endIndex - atIndex)
                     };
                 }

                 atIndex += curNode.data.length;

             }

             doAvoidNode = curNode.nodeType === Node.ELEMENT_NODE && elementFilter && !elementFilter(curNode);

             if (startPortion && endPortion) {

                 curNode = this.replaceMatch(match, startPortion, innerPortions, endPortion);

                 // processMatches has to return the node that replaced the endNode
                 // and then we step back so we can continue from the end of the
                 // match:

                 atIndex -= (endPortion.node.data.length - endPortion.endIndexInNode);

                 startPortion = null;
                 endPortion = null;
                 innerPortions = [];
                 match = matches.shift();
                 portionIndex = 0;
                 matchIndex++;

                 if (!match) {
                     break; // no more matches
                 }

             } else if (
                 !doAvoidNode &&
                 (curNode.firstChild || curNode.nextSibling)
             ) {
                 // Move down or forward:
                 if (curNode.firstChild) {
                     nodeStack.push(curNode);
                     curNode = curNode.firstChild;
                 } else {
                     curNode = curNode.nextSibling;
                 }
                 continue;
             }

             // Move forward or up:
             while (true) {
                 if (curNode.nextSibling) {
                     curNode = curNode.nextSibling;
                     break;
                 }
                 curNode = nodeStack.pop();
                 if (curNode === node) {
                     break out;
                 }
             }

         }

     },

     /**
      * Reverts ... TODO
      */
     revert: function() {
         // Reversion occurs backwards so as to avoid nodes subsequently
         // replaced during the matching phase (a forward process):
         for (var l = this.reverts.length; l--;) {
             this.reverts[l]();
         }
         this.reverts = [];
     },

     prepareReplacementString: function(string, portion, match) {
         var portionMode = this.options.portionMode;
         if (
             portionMode === PORTION_MODE_FIRST &&
             portion.indexInMatch > 0
         ) {
             return '';
         }
         string = string.replace(/\$(\d+|&|`|')/g, function($0, t) {
             var replacement;
             switch(t) {
                 case '&':
                     replacement = match[0];
                     break;
                 case '`':
                     replacement = match.input.substring(0, match.startIndex);
                     break;
                 case '\'':
                     replacement = match.input.substring(match.endIndex);
                     break;
                 default:
                     replacement = match[+t] || '';
             }
             return replacement;
         });

         if (portionMode === PORTION_MODE_FIRST) {
             return string;
         }

         if (portion.isEnd) {
             return string.substring(portion.indexInMatch);
         }

         return string.substring(portion.indexInMatch, portion.indexInMatch + portion.text.length);
     },

     getPortionReplacementNode: function(portion, match) {

         var replacement = this.options.replace || '$&';
         var wrapper = this.options.wrap;
         var wrapperClass = this.options.wrapClass;

         if (wrapper && wrapper.nodeType) {
             // Wrapper has been provided as a stencil-node for us to clone:
             var clone = doc.createElement('div');
             clone.innerHTML = wrapper.outerHTML || new XMLSerializer().serializeToString(wrapper);
             wrapper = clone.firstChild;
         }

         if (typeof replacement == 'function') {
             replacement = replacement(portion, match);
             if (replacement && replacement.nodeType) {
                 return replacement;
             }
             return doc.createTextNode(String(replacement));
         }

         var el = typeof wrapper == 'string' ? doc.createElement(wrapper) : wrapper;

          if (el && wrapperClass) {
             el.className = wrapperClass;
         }

         replacement = doc.createTextNode(
             this.prepareReplacementString(
                 replacement, portion, match
             )
         );

         if (!replacement.data) {
             return replacement;
         }

         if (!el) {
             return replacement;
         }

         el.appendChild(replacement);

         return el;
     },

     replaceMatch: function(match, startPortion, innerPortions, endPortion) {

         var matchStartNode = startPortion.node;
         var matchEndNode = endPortion.node;

         var precedingTextNode;
         var followingTextNode;

         if (matchStartNode === matchEndNode) {

             var node = matchStartNode;

             if (startPortion.indexInNode > 0) {
                 // Add `before` text node (before the match)
                 precedingTextNode = doc.createTextNode(node.data.substring(0, startPortion.indexInNode));
                 node.parentNode.insertBefore(precedingTextNode, node);
             }

             // Create the replacement node:
             var newNode = this.getPortionReplacementNode(
                 endPortion,
                 match
             );

             node.parentNode.insertBefore(newNode, node);

             if (endPortion.endIndexInNode < node.length) { // ?????
                 // Add `after` text node (after the match)
                 followingTextNode = doc.createTextNode(node.data.substring(endPortion.endIndexInNode));
                 node.parentNode.insertBefore(followingTextNode, node);
             }

             node.parentNode.removeChild(node);

             this.reverts.push(function() {
                 if (precedingTextNode === newNode.previousSibling) {
                     precedingTextNode.parentNode.removeChild(precedingTextNode);
                 }
                 if (followingTextNode === newNode.nextSibling) {
                     followingTextNode.parentNode.removeChild(followingTextNode);
                 }
                 newNode.parentNode.replaceChild(node, newNode);
             });

             return newNode;

         } else {
             // Replace matchStartNode -> [innerMatchNodes...] -> matchEndNode (in that order)


             precedingTextNode = doc.createTextNode(
                 matchStartNode.data.substring(0, startPortion.indexInNode)
             );

             followingTextNode = doc.createTextNode(
                 matchEndNode.data.substring(endPortion.endIndexInNode)
             );

             var firstNode = this.getPortionReplacementNode(
                 startPortion,
                 match
             );

             var innerNodes = [];

             for (var i = 0, l = innerPortions.length; i < l; ++i) {
                 var portion = innerPortions[i];
                 var innerNode = this.getPortionReplacementNode(
                     portion,
                     match
                 );
                 portion.node.parentNode.replaceChild(innerNode, portion.node);
                 this.reverts.push((function(portion, innerNode) {
                     return function() {
                         innerNode.parentNode.replaceChild(portion.node, innerNode);
                     };
                 }(portion, innerNode)));
                 innerNodes.push(innerNode);
             }

             var lastNode = this.getPortionReplacementNode(
                 endPortion,
                 match
             );

             matchStartNode.parentNode.insertBefore(precedingTextNode, matchStartNode);
             matchStartNode.parentNode.insertBefore(firstNode, matchStartNode);
             matchStartNode.parentNode.removeChild(matchStartNode);

             matchEndNode.parentNode.insertBefore(lastNode, matchEndNode);
             matchEndNode.parentNode.insertBefore(followingTextNode, matchEndNode);
             matchEndNode.parentNode.removeChild(matchEndNode);

             this.reverts.push(function() {
                 precedingTextNode.parentNode.removeChild(precedingTextNode);
                 firstNode.parentNode.replaceChild(matchStartNode, firstNode);
                 followingTextNode.parentNode.removeChild(followingTextNode);
                 lastNode.parentNode.replaceChild(matchEndNode, lastNode);
             });

             return lastNode;
         }
     }

 };

 return exposed;

}));
var words = [
    {
      "word": "addict",
      "alt": "person with a substance use disorder",
      "context": "Using person-first language helps to not define people by just one of their characteristics."
    },
    {
      "word": "addicted",
      "alt": "devoted",
      "context": "Trivializes the experiences of people who deal with substance abuse issues."
    },
    {
      "word": "basket case",
      "alt": "nervous",
      "context": "Originally referred to one who has lost all four limbs and therefore needed to be carried around in a basket."
    },
    {
      "word": "blind review",
      "alt": "anonymous review",
      "context": "Unintentionally perpetuates that disability is somehow abnormal or negative, furthering an ableist culture."
    },
    {
      "word": "blind study",
      "alt": "masked study",
      "context": "Unintentionally perpetuates that disability is somehow abnormal or negative, furthering an ableist culture."
    },
    {
      "word": "committed suicide",
      "alt": "died by suicide",
      "context": "Ableist language that trivializes the experiences of people living with mental health conditions."
    },
    {
      "word": "confined to a wheelchair",
      "alt": "person who uses a wheelchair",
      "context": "Using person-first language helps to not define people by just one of their characteristics. Also, users of wheelchairs often find them to be an essential tool for their freedom instead of thinking of them as a prison."
    },
    {
      "word": "crazy",
      "alt": "wild",
      "context": "Ableist language that trivializes the experiences of people living with mental health conditions."
    },
    {
      "word": "cripple",
      "alt": "person with a disability",
      "context": "Ableist language that trivializes the experiences of people living with disabilities."
    },
    {
      "word": "crippled",
      "alt": "disabled",
      "context": "Unnecessarily equates the weakening of something with people living with disabilities."
    },
    {
      "word": "dumb",
      "alt": "non-verbal",
      "context": "Once used to describe a person who could not speak and implied the person was incapable of expressing themselves."
    },
    {
      "word": "handicap parking",
      "alt": "accessible parking",
      "context": "Ableist language that trivializes the experiences of people living with disabilities."
    },
    {
      "word": "handicapped",
      "alt": "person with a disability",
      "context": "Using person-first language helps to not define people by just one of their characteristics."
    },
    {
      "word": "handicapped space",
      "alt": "accessible space",
      "context": "Ableist language that trivializes the experiences of people living with disabilities."
    },
    {
      "word": "insane",
      "alt": "surprising",
      "context": "Ableist language that trivializes the experiences of people living with mental health conditions."
    },
    {
      "word": "lame",
      "alt": "uncool",
      "context": "Ableist language that can trivialize the experience of people living with disabilities."
    },
    {
      "word": "mentally ill",
      "alt": "person living with a mental health condition",
      "context": "Using person-first language helps to not define people by just one of their characteristics."
    },
    {
      "word": "OCD",
      "alt": "detail-oriented",
      "context": "Ableist language that trivializes the experiences of people living with mental health conditions."
    },
    {
      "word": "paraplegic",
      "alt": "person who is paralyzed",
      "context": "This term generalizes a population of people while also implying that people with disabilities are not capable"
    },
    {
      "word": "quadriplegic",
      "alt": "person who is paralyzed",
      "context": "This term generalizes a population of people while also implying that people with disabilities are not capable."
    },
    {
      "word": "retard",
      "alt": "person with a cognitive disability",
      "context": "This term is a slur against those who are neurodivergent or have a cognitive disability."
    },
    {
      "word": "retarded",
      "alt": "boring",
      "context": "This term is a slur against those who are neurodivergent or have a cognitive disability. It should not be used to make a point about a person, place or thing."
    },
    {
      "word": "sanity check",
      "alt": "coherence check",
      "context": "This term could be offensive to those dealing with mental health issues."
    },
    {
      "word": "spaz",
      "alt": "clumsy",
      "context": "Ableist language that trivializes the experiences of people living with disabilities."
    },
    {
      "word": "stand up meeting",
      "alt": "quick meeting",
      "context": "Ableist language that trivializes the experiences of people living with disabilities."
    },
    {
      "word": "tone deaf",
      "alt": "unenlightened",
      "context": "Ableist language that trivializes the experiences of people living with disabilities."
    },
    {
      "word": "walk-in",
      "alt": "drop-in",
      "context": "Ableist language that trivializes the experiences of people living with disabilities."
    },
    {
      "word": "wheelchair bound",
      "alt": "person who uses a wheelchair",
      "context": "Using person-first language helps to not define people by just one of their characteristics. Also, users of wheelchairs often find them to be an essential tool for their freedom instead of thinking of them as a prison."
    },
    {
      "word": "gray beard",
      "alt": "the person's name",
      "context": "It calls out an older, and presumably more experienced, IT or cybersecurity person by referring to their age instead of their name."
    },
    {
      "word": "senile",
      "alt": "person suffering from senility",
      "context": "This term is often used disparagingly to refer to older people whose mental faculties appear to be in decline."
    },
    {
      "word": "Philippine Islands",
      "alt": "Philippines or the Republic of the Philippines",
      "context": "The term is politically incorrect and denotes colonialism. Some people of Filipino heritage might use the term, though."
    },
    {
      "word": "Brave",
      "alt": "_",
      "context": "This term perpetuates the stereotype of the \"noble courageous savage,\" equating the Indigenous male as being less than a man."
    },
    {
      "word": "bury the hatchet",
      "alt": "call for peace",
      "context": "Using this term is cultural appropriation of a centuries-old tradition among some North American Indigenous Peoples who buried their tools of war as a symbol of peace."
    },
    {
      "word": "chief",
      "alt": "the person's name",
      "context": "Calling a non-Indigenous person \"chief\" trivializes both the hereditary and elected chiefs in Indigenous communities. Calling an Indigenous person \"chief\" is a slur."
    },
    {
      "word": "Geronimo",
      "alt": "none/only use when discussing the historical figure",
      "context": "Geronimo was a famous leader and medicine man whose name is used today as a caricature of the brave warrior, often during \"macho\" pursuits."
    },
    {
      "word": "guru",
      "alt": "subject matter expert (SME)",
      "context": "In the Buddhist and Hindu traditions, the word is a sign of respect. Using it casually negates its original value."
    },
    {
      "word": "low man on the totem pole",
      "alt": "lacking seniority",
      "context": "Trivializes something that is sacred to Indigenous peoples. Also, in some First Nation communities, being low on the totem pole is actually a higher honor than being on top. The term also reinforces male-dominated language."
    },
    {
      "word": "on the warpath",
      "alt": "on the offensive",
      "context": "Cultural appropriation of a term that referred to the route taken by Indigenous people heading toward a battle with an enemy."
    },
    {
      "word": "Pocahontas",
      "alt": "the person's name",
      "context": "This is a slur and should not be used to address an Indigenous woman unless that is her actual name."
    },
    {
      "word": "pow wow",
      "alt": "meet",
      "context": "Using this term in this manner demeans a term of cultural significance to Indigenous peoples."
    },
    {
      "word": "powwow",
      "alt": "meet",
      "context": "Using this term in this manner demeans a term of cultural significance to Indigenous peoples."
    },
    {
      "word": "spirit animal",
      "alt": "animal I most admire or would like to be",
      "context": "The term refers to an animal spirit that guides/protects one on a journey, so to equate it with an animal one likes is to demean the significance of the term."
    },
    {
      "word": "too many chiefs, not enough indians",
      "alt": "a lack of clear direction",
      "context": "Trivializes the structure of Indigenous communities."
    },
    {
      "word": "tribal knowledge",
      "alt": "institutional knowledge",
      "context": "This term trivializes the ancestral knowledge handed down through generations of Indigenous peoples."
    },
    {
      "word": "tribe",
      "alt": "network",
      "context": "Historically used to equate Indigenous people with savages."
    },
    {
      "word": "preferred pronouns",
      "alt": "pronouns",
      "context": "The word \"preferred\" suggests that non-binary gender identity is a choice and a preference."
    },
    {
      "word": "balls to the wall",
      "alt": "accelerate efforts",
      "context": "Attributes personality traits to anatomy."
    },
    {
      "word": "ballsy",
      "alt": "bold",
      "context": "Attributes personality traits to anatomy."
    },
    {
      "word": "chairman",
      "alt": "chairperson",
      "context": "Lumps a group of people using gender binary language, which doesn't include everyone."
    },
    {
      "word": "chairwoman",
      "alt": "chairperson",
      "context": "Lumps a group of people using gender binary language, which doesn't include everyone."
    },
    {
      "word": "congressman",
      "alt": "congressperson",
      "context": "Lumps a group of people using gender binary language, which doesn't include everyone."
    },
    {
      "word": "congresswoman",
      "alt": "congressperson",
      "context": "Lumps a group of people using gender binary language, which doesn't include everyone."
    },
    {
      "word": "fireman",
      "alt": "firefighter",
      "context": "Lumps a group of people using masculine language and/or into gender binary groups, which don't include everyone"
    },
    {
      "word": "firemen",
      "alt": "firefighter",
      "context": "Lumps a group of people using masculine language and/or into gender binary groups, which don't include everyone"
    },
    {
      "word": "freshman",
      "alt": "first-year student",
      "context": "Lumps a group of people using masculine language and/or into gender binary groups, which don't include everyone"
    },
    {
      "word": "gentlemen",
      "alt": "everyone",
      "context": "Lumps a group of people using masculine language and/or into gender binary groups, which don't include everyone"
    },
    {
      "word": "guys",
      "alt": "folks",
      "context": "This term reinforces male-dominated language."
    },
    {
      "word": "have the balls to",
      "alt": "bold",
      "context": "Attributes personality traits to anatomy."
    },
    {
      "word": "he",
      "alt": "they",
      "context": "Unless you know the person you're addressing uses \"he\" as their pronoun, it is better to use \"they\" or to ask the person which pronouns they use."
    },
    {
      "word": "him",
      "alt": "them",
      "context": "Unless you know the person you're addressing uses \"him\" as their pronoun, it is better to use \"them\" or to ask the person which pronouns they use."
    },
    {
      "word": "his",
      "alt": "their",
      "context": "Unless you know the person you're addressing uses \"his\" as their pronoun, it is better to use \"their\" or to ask the person which pronouns they use."
    },
    {
      "word": "hermaphrodite",
      "alt": "intersex person",
      "context": "This term has historically been used as a slur against LGBTQ+ people."
    },
    {
      "word": "ladies",
      "alt": "everyone",
      "context": "Lumps a group of people using gender binary language that doesn't include everyone."
    },
    {
      "word": "landlord",
      "alt": "property owner",
      "context": "Lumps a group of people using gender binary language, which doesn't include everyone."
    },
    {
      "word": "landlady",
      "alt": "property owner",
      "context": "Lumps a group of people using gender binary language, which doesn't include everyone."
    },
    {
      "word": "mailman",
      "alt": "mail person",
      "context": "Lumps a group of public servants using masculine language and/or into gender binary groups, which don't include everyone."
    },
    {
      "word": "man hours",
      "alt": "person hours",
      "context": "This term reinforces male-dominated language."
    },
    {
      "word": "man-in-the-middle",
      "alt": "person-in-the-middle",
      "context": "This term reinforces male-dominated language."
    },
    {
      "word": "mankind",
      "alt": "human beings",
      "context": "This term reinforces male-dominated language."
    },
    {
      "word": "manmade",
      "alt": "made by hand",
      "context": "This term reinforces male-dominated language."
    },
    {
      "word": "manpower",
      "alt": "personnel resources",
      "context": "This term reinforces male-dominated language."
    },
    {
      "word": "policeman",
      "alt": "police officer",
      "context": "Lumps a group of people using gender binary language, which doesn't include everyone."
    },
    {
      "word": "policemen",
      "alt": "police officers",
      "context": "Lumps a group of people using gender binary language, which doesn't include everyone."
    },
    {
      "word": "policewoman",
      "alt": "police officer",
      "context": "Lumps a group of people using gender binary language, which doesn't include everyone."
    },
    {
      "word": "policewomen",
      "alt": "police officers",
      "context": "Lumps a group of people using gender binary language, which doesn't include everyone."
    },
    {
      "word": "seminal",
      "alt": "groundbreaking",
      "context": "This term reinforces male-dominated language"
    },
    {
      "word": "she",
      "alt": "they",
      "context": "Unless you know the person you're addressing uses \"she\" as their pronoun, it is better to use \"they\" or to ask the person which pronouns they use."
    },
    {
      "word": "her",
      "alt": "their",
      "context": "Unless you know the person you're addressing uses \"her\" as their pronoun, it is better to use \"their\" or to ask the person which pronouns they use."
    },
    {
      "word": "hers",
      "alt": "theirs",
      "context": "Unless you know the person you're addressing uses \"her\" as their pronoun, it is better to use \"theirs\" or to ask the person which pronouns they use."
    },
    {
      "word": "shemale",
      "alt": "transgender woman",
      "context": "This slur is often used disparagingly to refer to people who don't conform to gender expectations. Some in the community do identify with and self-describe as the term, though."
    },
    {
      "word": "tranny",
      "alt": "trans or non-gendering conforming folk",
      "context": "This slur is often used disparagingly to refer to people who don't conform to gender expectations. Some in the community do identify with and self-describe as the term, though."
    },
    {
      "word": "trannie",
      "alt": "trans or non-gendering conforming folk",
      "context": "This slur is often used disparagingly to refer to people who don't conform to gender expectations. Some in the community do identify with and self-describe as the term, though."
    },
    {
      "word": "transgendered",
      "alt": "transgender",
      "context": "This term avoids connections that being transgender is something that is done to a person and/or that some kind of transition is required."
    },
    {
      "word": "transsexual",
      "alt": "trans or non-gendering conforming folk",
      "context": "This term has historically been used as a slur against LGBTQ+ people. Some in the community do identify with and self-describe as the term, though."
    },
    {
      "word": "you guys",
      "alt": "folks",
      "context": "Lumps a group of people using masculine language and/or into gender binary groups, which don't include everyone."
    },
    {
      "word": "abort",
      "alt": "cancel",
      "context": "This term can unintentionally raise religious/moral concerns over abortion."
    },
    {
      "word": "child prostitute",
      "alt": "child who has been trafficked",
      "context": "Using person-first language helps to not define people by just one of their characteristics."
    },
    {
      "word": "circle the wagons",
      "alt": "take a defensive position",
      "context": "Hollywood movies about settlers migrating west contributed greatly to the formation of this phrase, which means that \"savages\" are coming and a group of (White) people is about to be attacked. It also paints Indigenous Peoples as the aggressors."
    },
    {
      "word": "half-breed",
      "alt": "person of multiple ethnicities",
      "context": "This term is generally considered to be a slur against those of mixed race. Some in the community do identify with and self-describe as the term, though."
    },
    {
      "word": "Hispanic",
      "alt": "Latinx",
      "context": "Although widely used to describe people from Spanish-speaking countries outside of Spain, its roots lie in Spain's colonization of South American countries. Instead of referring to someone as Hispanic because of their name or appearance, ask them how they identify themselves first."
    },
    {
      "word": "Indian giver",
      "alt": "one who expects an equivalent gift in return for one that was given",
      "context": "This term likely derives from misunderstandings about trade customs in early relationships between Indigenous people and White settlers. It is a slur that should not be used to describe anyone."
    },
    {
      "word": "Indian summer",
      "alt": "late summer",
      "context": "This term infers that Indigenous people are chronically late. While it may be innocently used to describe a beautiful time of year, it could have an unintended negative impact on those who hear it."
    },
    {
      "word": "Karen",
      "alt": "demanding or entitled White woman",
      "context": "This term is used to ridicule or demean a certain group of people based on their behaviors."
    },
    {
      "word": "Oriental",
      "alt": "person of Asian descent",
      "context": "This term is seen as pejorative as it racializes people of Asian descent as forever opposite \"others.\" (Occidental vs Oriental)"
    },
    {
      "word": "peanut gallery",
      "alt": "hecklers or critics",
      "context": "This term refers to the cheapest and worst section in theaters where many Black people sat during the Vaudeville era."
    },
    {
      "word": "people of color",
      "alt": "BIPOC",
      "context": "If speaking about a specific group, name that group"
    },
    {
      "word": "straight",
      "alt": "heterosexual",
      "context": "This term implies that anyone who is not heterosexual is bent or not \"normal."
    },
    {
      "word": "stupid",
      "alt": "boring",
      "context": "Once used to describe a person who could not speak and implied the person was incapable of expressing themselves."
    },
    {
      "word": "survivor",
      "alt": "person who has experienced",
      "context": "Using person-first language helps to not define people by just one of their experiences. If the person identifies with the term, then use it."
    },
    {
      "word": "tarbaby",
      "alt": "difficult problem",
      "context": "This is a dismissive term for a Black person."
    },
    {
      "word": "thug",
      "alt": "criminal",
      "context": "Although the term refers to a violent person or criminal, it often takes on a racist connotation when used in certain circles."
    },
    {
      "word": "user",
      "alt": "client",
      "context": "While often associated with one who uses (software, systems, services), it can also negatively be associated with those who suffer from substance abuse issues or those who exploit others for their own gain."
    },
    {
      "word": "victim",
      "alt": "person who has experienced",
      "context": "Using person-first language helps to not define people by just one of their experiences. If the person identifies with the term, then use it."
    },
    {
      "word": "barrio",
      "alt": "specific name of neighborhood",
      "context": "The term indicates any socially segregated non-white neighborhood."
    },
    {
      "word": "black hat",
      "alt": "malicious",
      "context": "Assigns negative connotations to the color black, racializing the term."
    },
    {
      "word": "black mark",
      "alt": "something that is held against one",
      "context": "Assigns negative connotations to the color black, racializing the term."
    },
    {
      "word": "black sheep",
      "alt": "outcast",
      "context": "Assigns negative connotations to the color black, racializing the term."
    },
    {
      "word": "blackballed",
      "alt": "denied",
      "context": "Assigns negative connotations to the color black, racializing the term."
    },
    {
      "word": "blackbox",
      "alt": "opaque box",
      "context": "Assigns negative connotations to the color black, racializing the term."
    },
    {
      "word": "blacklist",
      "alt": "denylist",
      "context": "Assigns negative connotations to the color black, racializing the term."
    },
    {
      "word": "blacklisted",
      "alt": "disallowed",
      "context": "Assigns negative connotations to the color black, racializing the term."
    },
    {
      "word": "brown bag",
      "alt": "lunch and learn",
      "context": "Historically associated with the \"brown paper bag test\" that certain Black sororities and fraternities used to judge skin color. Those whose skin color was darker than the brown bag were not allowed to join."
    },
    {
      "word": "cakewalk",
      "alt": "easy",
      "context": "Enslaved people covertly used exaggerated dance to mock their enslavers. This turned into \"balls\" that the White enslavers would hold for entertainment where the prize was a cake."
    },
    {
      "word": "gangbusters",
      "alt": "very successful",
      "context": "Unnecessarily invokes the notion of police action against \"gangs\" in a positive light, which may have racial undertones."
    },
    {
      "word": "ghetto",
      "alt": "neighborhood's name",
      "context": "The term indicates any socially segregated non-white neighborhood."
    },
    {
      "word": "grandfather",
      "alt": "legacy",
      "context": "This term has its roots in the \"grandfather clause\" adopted by Southern states to deny voting rights to Blacks."
    },
    {
      "word": "grandfathered",
      "alt": "legacy status",
      "context": "This term has its roots in the \"grandfather clause\" adopted by Southern states to deny voting rights to Blacks."
    },
    {
      "word": "gray hat hacker",
      "alt": "hacktivist",
      "context": "Hacker who exploits a weakness in cyber defense to bring the weakness to the attention of the owner, with the goal of improving security. This term combines black hat and white hat, which both hold racial connotations."
    },
    {
      "word": "master",
      "alt": "become adept in",
      "context": "Historically, masters enslaved people, didn't consider them human and didn't allow them to express free will, so this term should generally be avoided."
    },
    {
      "word": "master list",
      "alt": "canonical list",
      "context": "Historically, masters enslaved people, didn't consider them human and didn't allow them to express free will, so this term should generally be avoided."
    },
    {
      "word": "red team",
      "alt": "cyber offense team",
      "context": "Red\" is often used disparagingly to refer to Indigenous peoples, so its use in this context could be offensive to some groups."
    },
    {
      "word": "scalper",
      "alt": "reseller",
      "context": "This term refers to the practice of removing a piece of an enemy's scalp with hair still attached. Although both colonizers and Indigenous Peoples performed the practice, it was used as proof of how savage the Natives were. Yet the colonizers were the ones who paid cash bounties for Native scalps, as has been documented in the United States, Canada and Mexico."
    },
    {
      "word": "scalping",
      "alt": "reselling",
      "context": "This term refers to the practice of removing a piece of an enemy's scalp with hair still attached. Although both colonizers and Indigenous Peoples performed the practice, it was used as proof of how savage the Natives were. Yet the colonizers were the ones who paid cash bounties for Native scalps, as has been documented in the United States, Canada and Mexico."
    },
    {
      "word": "Scrum Master",
      "alt": "agile lead",
      "context": "Historically, masters enslaved people, didn't consider them human and didn't allow them to express free will, so this term should generally be avoided"
    },
    {
      "word": "slave",
      "alt": "worker",
      "context": "The historical context of this term involved oppression of a group of people who were enslaved, thought of as less than human and unable to exercise free will."
    },
    {
      "word": "slave labor",
      "alt": "unfair work practices",
      "context": "References a time when enslavement of people (in particular Black Americans) was allowed."
    },
    {
      "word": "sold down the river",
      "alt": "betrayed",
      "context": "This term originally referred to a person who was enslaved who was sold as punishment."
    },
    {
      "word": "tarball",
      "alt": "tar archive",
      "context": "While the term refers to an archive that has been created with the tar command, it can be negatively associated with the pejorative term tarbaby."
    },
    {
      "word": "to call a spade a spade",
      "alt": "to call something what it is",
      "context": "Although the term has its origins in Greek literature, the subsequent negative connotations with the word \"spade\" means that the phrase should be used with caution or not at all."
    },
    {
      "word": "calling a spade a spade",
      "alt": "calling something what it is",
      "context": "Although the term has its origins in Greek literature, the subsequent negative connotations with the word \"spade\" means that the phrase should be used with caution or not at all."
    },
    {
      "word": "uppity",
      "alt": "arrogant",
      "context": "Although the term originated in the Black community to describe another Black person who didn't know their socioeconomic place, it was quickly adopted by White Supremacists to describe any Black person who didn't act as \"expected."
    },
    {
      "word": "webmaster",
      "alt": "web product owner",
      "context": "Historically, masters enslaved people, didn't consider them human and didn't allow them to express free will, so this term should generally be avoided."
    },
    {
      "word": "web master",
      "alt": "web product owner",
      "context": "Historically, masters enslaved people, didn't consider them human and didn't allow them to express free will, so this term should generally be avoided."
    },
    {
      "word": "white hat hacker",
      "alt": "ethical hacker",
      "context": "Assigns value connotations based on color (white = good), an act which is subconsciously racialized."
    },
    {
      "word": "white paper",
      "alt": "position paper",
      "context": "Assigns value connotations based on color (white = good), an act which is subconsciously racialized."
    },
    {
      "word": "white team",
      "alt": "cyber exercise cell",
      "context": "Assigns value connotations based on color (white = good), an act which is subconsciously racialized"
    },
    {
      "word": "whitebox",
      "alt": "clear box",
      "context": "Assigns value connotations based on color (white = good), an act which is subconsciously racialized."
    },
    {
      "word": "whitelist",
      "alt": "allowlist",
      "context": "Assigns value connotations based on color (white = good), an act which is subconsciously racialized."
    },
    {
      "word": "whitespace",
      "alt": "empty space",
      "context": "Assigns value connotations based on color (white = good), an act which is subconsciously racialized."
    },
    {
      "word": "yellow team",
      "alt": "DevSecOps team",
      "context": "Yellow\" is often used disparagingly against people of Asian descent."
    },
    {
      "word": "convict",
      "alt": "person who is incarcerated",
      "context": "Using person-first language helps to not define people by just one of their characteristics."
    },
    {
      "word": "disabled person",
      "alt": "person with a disability",
      "context": "Disabled person\" implies that the disability defines a person, whereas \"Person with a disability\" gives the ownership of the disability to the person."
    },
    {
      "word": "homeless person",
      "alt": "person without housing",
      "context": "Using person-first language helps to not define people by just one of their characteristics."
    },
    {
      "word": "immigrant",
      "alt": "person who has immigrated",
      "context": "Using person-first language helps to not define people by just one of their characteristics."
    },
    {
      "word": "prisoner",
      "alt": "person who is incarcerated",
      "context": "Using person-first language helps to not define people by just one of their characteristics."
    },
    {
      "word": "prostitute",
      "alt": "person who engages in sex work",
      "context": "Using person-first language helps to not define people by just one of their characteristics."
    },
    {
      "word": "abusive relationship",
      "alt": "relationship with an abusive person",
      "context": "The relationship doesn't commit abuse. A person does, so it is important to make that fact clear."
    },
    {
      "word": "beat a dead horse",
      "alt": "refuse to let something go",
      "context": "This expression normalizes violence against animals."
    },
    {
      "word": "beating a dead horse",
      "alt": "refusing to let something go",
      "context": "This expression normalizes violence against animals."
    },
    {
      "word": "crack the whip",
      "alt": "come down hard",
      "context": "Unnecessary use of violent imagery that paints the person being referred to as authoritarian or oppressive."
    },
    {
      "word": "go off the reservation",
      "alt": "not think or function properly",
      "context": "This phrase is rooted in the violent removal of Indigenous people from their land and the horrible consequences for an Indigenous person who left the reservation. This phrase could also fit under the Cultural Appropriation category."
    },
    {
      "word": "kill two birds with one stone",
      "alt": "accomplish two things at once",
      "context": "This expression normalizes violence against animals."
    },
    {
      "word": "kill two birds with one stone",
      "alt": "accomplishing two things at once",
      "context": "This expression normalizes violence against animals."
    },
    {
      "word": "killing it",
      "alt": "doing a great job",
      "context": "Doing a good job should not be equated with death. The term could also be triggering if someone close to the recipient actually was killed."
    },
    {
      "word": "killed it",
      "alt": "did a great job",
      "context": "Doing a good job should not be equated with death. The term could also be triggering if someone close to the recipient actually was killed."
    },
    {
      "word": "more than one way to skin a cat",
      "alt": "multiple ways to accomplish the task",
      "context": "This expression normalizes violence against animals."
    },
    {
      "word": "pull the trigger",
      "alt": "give it a go",
      "context": "Unnecessarily uses violent imagery to encourage another person to do something."
    },
    {
      "word": "rule of thumb",
      "alt": "standard rule",
      "context": "Although no written record exists today, this phrase is attributed to an old British law that allowed men to beat their wives with sticks no wider than their thumb."
    },
    {
      "word": "take a shot at",
      "alt": "give it a go",
      "context": "These terms represent the unnecessary use of the imagery of hurting someone or something."
    },
    {
      "word": "take your best shot at",
      "alt": "give it a go",
      "context": "These terms represent the unnecessary use of the imagery of hurting someone or something."
    },
    {
      "word": "take a stab at",
      "alt": "give it a go",
      "context": "These terms represent the unnecessary use of the imagery of hurting someone or something."
    },
    {
      "word": "trigger warning",
      "alt": "content note",
      "context": "The phrase can cause stress about what's to follow. Additionally, one can never know what may or may not trigger a particular person."
    },
    {
      "word": "war room",
      "alt": "situation room",
      "context": "Unneccesary use of violent language"
    },
    {
      "word": "whipped into shape",
      "alt": "put in order",
      "context": "The phrase has its roots in the punishment of enslaved people to get them to follow the rules."
    },
    {
      "word": "wife beater",
      "alt": "white ribbed tank top",
      "context": "This phrase trivializes domestic violence by associating it with a piece of clothing"
    },
    {
      "word": "African American",
      "alt": "Black",
      "context": "Black people who were born in the United States can interpret hyphenating their identity as \"othering.\" As with many of the terms we're highlighting, some people do prefer to use/be addressed by this term, so it's best to ask a person which term they prefer to have used when addressing them. When used to refer to a person, the \"b\" should always be capitalized."
    },
    {
      "word": "African-American",
      "alt": "Black",
      "context": "Black people who were born in the United States can interpret hyphenating their identity as \"othering.\" As with many of the terms we're highlighting, some people do prefer to use/be addressed by this term, so it's best to ask a person which term they prefer to have used when addressing them. When used to refer to a person, the \"b\" should always be capitalized."
    },
    {
      "word": "circle the wagons",
      "alt": "marshall forces",
      "context": "This phrase suggests an impending attack by the \"savages\" and should be avoided."
    },
    {
      "word": "gip",
      "alt": "cheat",
      "context": "This term is derived from \"gypsy\" and relates to the stereotype that Romani people are swindlers."
    },
    {
      "word": "gyp",
      "alt": "cheat",
      "context": "This term is derived from \"gypsy\" and relates to the stereotype that Romani people are swindlers."
    },
    {
      "word": "gypped",
      "alt": "ripped off",
      "context": "This term is derived from \"gypsy\" and relates to the stereotype that Romani people are swindlers."
    },
    {
      "word": "hick",
      "alt": "unsophisicated person",
      "context": "This term assumes that those who come from rural environments are uneducated and/or unsophisticated."
    },
    {
      "word": "hillbilly",
      "alt": "person from the Appalachian or Ozark regions of the US",
      "context": "This is a derogatory term for someone based on the region in which they live or were born."
    },
    {
      "word": "hip-hip hurray",
      "alt": "hooray",
      "context": "This term was used by German citizens during the Holocaust as a rallying cry when they would hunt down Jewish citizens living in segregated neighborhoods."
    },
    {
      "word": "hip hip hooray",
      "alt": "hooray",
      "context": "This term was used by German citizens during the Holocaust as a rallying cry when they would hunt down Jewish citizens living in segregated neighborhoods."
    },
    {
      "word": "hold down the fort",
      "alt": "cover the role",
      "context": "This phrase stems from settlers and soldiers resisting \"savages\" when \"on the warpath."
    },
    {
      "word": "Jewed",
      "alt": "haggled down",
      "context": "This term is based on a stereotype that people of Jewish descent are cheap and/or hoard money."
    },
    {
      "word": "long time no see",
      "alt": "I haven't seen you in so long!",
      "context": "This phrase was originally used to mock Indigenous peoples and Chinese who spoke pidgin English."
    },
    {
      "word": "no can do",
      "alt": "I can't do it",
      "context": "Originated from stereotypes that mocked non-native English speakers."
    },
    {
      "word": "normal person",
      "alt": "ordinary person",
      "context": "This phrase results in the \"othering\" of non-White people and those who live with disabilities, mental illness or disease as not being whole or regular"
    },
    {
      "word": "submit",
      "alt": "process",
      "context": "Depending on the context, the term can imply allowing others to have power over you."
    },
    {
      "word": "American",
      "alt": "US Citizen",
      "context": "This term often refers to people from the United States only, thereby insinuating that the US is the most important country in the Americas (which is actually made up of 42 countries)."
    }
  ];  
localStorage.setItem('words', JSON.stringify(words));