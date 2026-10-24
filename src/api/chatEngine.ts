import { Listing, User, ChatMessage } from '../types';

interface GenerateReplyParams {
  conversationId: string;
  userText: string;
  listing?: Listing | null;
  currentUser?: User | null;
  otherUser?: { id: string; name: string };
  lastReply?: string;
}

/**
 * Extracts numeric offer amount from strings like:
 * "20000", "₹20,000", "20k", "1.5k", "can you do 1800", "₹1200?"
 */
export function extractOfferAmount(text: string): number | null {
  const clean = text.toLowerCase().replace(/,/g, '');

  // 1. Check for "k" notation: e.g. "20k", "1.5k", "₹20k"
  const kMatch = clean.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*k\b/i);
  if (kMatch) {
    const val = parseFloat(kMatch[1]);
    if (!isNaN(val) && val > 0) {
      return Math.round(val * 1000);
    }
  }

  // 2. Check for explicit currency symbol: e.g. "₹20000", "rs 1800"
  const currMatch = clean.match(/(?:₹|rs\.?|inr)\s*(\d{2,7})/i);
  if (currMatch) {
    const val = parseInt(currMatch[1], 10);
    if (!isNaN(val) && val > 0) return val;
  }

  // 3. Check for standalone numbers (between 2 and 7 digits, e.g. "can you do 1500?")
  const numMatches = clean.match(/\b\d{2,7}\b/g);
  if (numMatches) {
    // Pick the last number or one that looks like a reasonable price offer
    for (const raw of numMatches) {
      const val = parseInt(raw, 10);
      // Filter out year like 2026 or 4-digit PIN mentions if text includes 'pin'
      if (val === 2026 || (clean.includes('pin') && val >= 1000 && val <= 9999 && !clean.includes('₹'))) {
        continue;
      }
      if (val > 0) return val;
    }
  }

  return null;
}

/**
 * Rule-based mock engine that detects intent and replies in a natural,
 * short, polite way using real listing data.
 *
 * Enforces:
 * - Anti-repetition: never repeats the same reply twice in a row.
 * - Anti-PIN leak: never asks for or reveals the PIN in chat.
 * - Bidirectional: handles both buyer user (mock is seller) and seller user (mock is buyer).
 */
export function generateRuleBasedReply(params: GenerateReplyParams): string {
  const { userText, listing, currentUser, otherUser, lastReply } = params;
  const lower = userText.trim().toLowerCase();

  const isUserSeller = Boolean(currentUser && listing && currentUser.id === listing.seller.id);
  const sellerName = listing ? listing.seller.name : otherUser?.name || 'Seller';
  const sellerFirstName = sellerName.split(' ')[0];
  const listingTitle = listing ? listing.title : 'item';
  const askingPrice = listing ? listing.price : 1000;
  const listingStatus = listing ? listing.status : 'Available';
  const condition = listing ? listing.condition : 'Good';
  const pickupSpot =
    listing?.campusPickupSpot ||
    (listing?.seller?.hostelOrArea ? `${listing.seller.hostelOrArea} gate` : 'RVCE Central Library or Nescafe stall');

  const possibleReplies: string[] = [];

  // =========================================================================
  // 1. PIN & TRADE SAFETY INTENT
  // =========================================================================
  if (
    lower.includes('pin') ||
    lower.includes('payment') ||
    lower.includes('pay') ||
    lower.includes('cash') ||
    lower.includes('upi') ||
    lower.includes('handover') ||
    lower.includes('confirm trade')
  ) {
    if (isUserSeller) {
      possibleReplies.push(
        "Understood! When we meet, I'll inspect the item first and enter the PIN in Campus Mart to confirm the handover. I won't share the PIN in chat.",
        "Sounds good! We can complete the payment in person after I verify the item and enter the 4-digit PIN."
      );
    } else {
      possibleReplies.push(
        `For safety, we do the handover in person! You inspect the ${listingTitle.slice(0, 24)} first, then tap Confirm Trading in Campus Mart. Enter the 4-digit PIN only after receiving the item — never share your PIN in chat!`,
        `Payment and trade confirmation happen in person. Please inspect the item thoroughly before releasing the PIN. Never share your PIN here in chat!`
      );
    }
  }

  // =========================================================================
  // 2. AVAILABILITY INTENT
  // =========================================================================
  else if (
    lower.includes('available') ||
    lower.includes('still there') ||
    lower.includes('still have') ||
    lower.includes('sold yet') ||
    lower.includes('in stock') ||
    lower.includes('anyone taken') ||
    lower.includes('is it there')
  ) {
    if (isUserSeller) {
      possibleReplies.push(
        `Great! I'm definitely interested in purchasing your ${listingTitle.slice(0, 24)}. When and where on campus can we meet?`,
        `Glad it's still available! Could we meet today after classes for the handover?`
      );
    } else {
      if (listingStatus === 'Available') {
        possibleReplies.push(
          `Yes, it is still available! Are you free to meet on campus today?`,
          `Hi! Yes, the ${listingTitle.slice(0, 25)} is available. Would you like to inspect it on campus today?`,
          `Yes, still available! Let me know if you want to test it out around ${pickupSpot}.`
        );
      } else if (listingStatus === 'Reserved') {
        possibleReplies.push(
          `It is currently reserved for another student meetup, but if that trade doesn't go through, you'll be next in line!`,
          `Someone has reserved it for this evening. If they don't confirm the trade, I'll message you right away.`
        );
      } else {
        possibleReplies.push(
          `Sorry, this item was already sold and handed over. Feel free to browse other campus listings!`,
          `Ah, this has already been sold. Thanks for checking though!`
        );
      }
    }
  }

  // =========================================================================
  // 3. PRICE OR NEGOTIATION INTENT
  // =========================================================================
  else if (
    lower.includes('price') ||
    lower.includes('discount') ||
    lower.includes('negotiable') ||
    lower.includes('offer') ||
    lower.includes('do for') ||
    lower.includes('can you do') ||
    lower.includes('less') ||
    lower.includes('cost') ||
    lower.includes('final') ||
    lower.includes('₹') ||
    lower.includes('rs') ||
    extractOfferAmount(userText) !== null
  ) {
    const offer = extractOfferAmount(userText);

    if (isUserSeller) {
      // Mock is BUYER
      if (offer && offer < askingPrice) {
        possibleReplies.push(
          `Would ₹${offer.toLocaleString('en-IN')} work for an immediate pickup today near your hostel?`,
          `I can do ₹${offer.toLocaleString('en-IN')} and come directly to your pickup spot right after my class!`
        );
      } else {
        possibleReplies.push(
          `Could you do a small student discount if I pick it up today?`,
          `The price of ₹${askingPrice.toLocaleString('en-IN')} works for me if the condition is as described!`
        );
      }
    } else {
      // Mock is SELLER
      if (offer !== null) {
        const ratio = offer / askingPrice;

        if (ratio >= 0.9) {
          // Within ~10% of asking price (or above)
          if (offer >= askingPrice) {
            possibleReplies.push(
              `Deal! ₹${offer.toLocaleString('en-IN')} works for me. Where on campus should we meet?`,
              `Done! ₹${offer.toLocaleString('en-IN')} is agreed. Let's meet at ${pickupSpot}!`
            );
          } else {
            possibleReplies.push(
              `₹${offer.toLocaleString('en-IN')} sounds fair for a fellow campus student! Deal. When can we meet?`,
              `I can do ₹${offer.toLocaleString('en-IN')} if we can complete the handover today at ${pickupSpot}. Does that work?`,
              `Accepted! ₹${offer.toLocaleString('en-IN')} is fine. Let me know what time works best for you.`
            );
          }
        } else {
          // Far lower than asking price
          const counter = Math.round((askingPrice * 0.94) / 10) * 10;
          possibleReplies.push(
            `₹${offer.toLocaleString('en-IN')} is a bit too low since this is in ${condition} condition. The lowest I can do is ₹${counter.toLocaleString('en-IN')}. Would that work?`,
            `Sorry, I can't let it go for ₹${offer.toLocaleString('en-IN')}. I can bring it down to ₹${counter.toLocaleString('en-IN')} if you can pick it up today!`,
            `That's too low for me, but I can offer ₹${counter.toLocaleString('en-IN')} as my best student price.`
          );
        }
      } else {
        // Negotiation mentioned without a specific amount
        const smallDiscount = Math.min(200, Math.round(askingPrice * 0.05));
        const discounted = Math.max(10, askingPrice - smallDiscount);
        possibleReplies.push(
          `The listed price is ₹${askingPrice.toLocaleString('en-IN')}, but I can do ₹${discounted.toLocaleString('en-IN')} if you pick it up today on campus.`,
          `Price is ₹${askingPrice.toLocaleString('en-IN')}. I can give a small ₹${smallDiscount} discount if you can meet near ${pickupSpot} today!`
        );
      }
    }
  }

  // =========================================================================
  // 4. MEETUP & LOCATION INTENT
  // =========================================================================
  else if (
    lower.includes('meet') ||
    lower.includes('where') ||
    lower.includes('location') ||
    lower.includes('pickup') ||
    lower.includes('hostel') ||
    lower.includes('gate') ||
    lower.includes('library') ||
    lower.includes('canteen') ||
    lower.includes('time') ||
    lower.includes('today') ||
    lower.includes('tomorrow') ||
    lower.includes('evening') ||
    lower.includes('afternoon')
  ) {
    if (isUserSeller) {
      possibleReplies.push(
        `Does around 5:00 PM near ${pickupSpot} work for you? I can be there right after my lab.`,
        `I can come to ${pickupSpot} around 4:30 PM today. Let me know if that time suits you!`
      );
    } else {
      possibleReplies.push(
        `We can meet near ${pickupSpot}! What time works best for you between classes?`,
        `I'm free today after 4:30 PM near ${pickupSpot}. Let me know if that time works!`,
        `How about meeting at ${pickupSpot} around 5 PM? You can inspect the item there.`
      );
    }
  }

  // =========================================================================
  // 5. CONDITION, SPECS & WARRANTY INTENT
  // =========================================================================
  else if (
    lower.includes('condition') ||
    lower.includes('working') ||
    lower.includes('scratch') ||
    lower.includes('dent') ||
    lower.includes('damage') ||
    lower.includes('specs') ||
    lower.includes('ram') ||
    lower.includes('storage') ||
    lower.includes('battery') ||
    lower.includes('bill') ||
    lower.includes('box') ||
    lower.includes('warranty') ||
    lower.includes('charger') ||
    lower.includes('original') ||
    lower.includes('how old')
  ) {
    if (isUserSeller) {
      possibleReplies.push(
        `Could you confirm if all the accessories and original cords are included?`,
        `Are there any scratches or issues I should know about before we meet?`
      );
    } else {
      const descSnippet = listing?.description ? listing.description.slice(0, 90) : 'Used carefully during semester';
      possibleReplies.push(
        `It is in ${condition} condition! ${descSnippet}. You can test and inspect it completely when we meet.`,
        `Everything is in proper working condition with no issues. You are welcome to test it thoroughly before confirming the trade!`,
        `Condition is ${condition}. All original accessories shown in the photos are included.`
      );
    }
  }

  // =========================================================================
  // 6. GREETING INTENT
  // =========================================================================
  else if (
    lower.startsWith('hi') ||
    lower.startsWith('hello') ||
    lower.startsWith('hey') ||
    lower.startsWith('namaste') ||
    lower.includes('good morning') ||
    lower.includes('good evening') ||
    lower.includes('good afternoon')
  ) {
    if (isUserSeller) {
      possibleReplies.push(
        `Hey! I'm interested in your ${listingTitle.slice(0, 24)}. Is it still available?`,
        `Hi! Saw your listing on Campus Mart. Could we discuss the pickup details?`
      );
    } else {
      possibleReplies.push(
        `Hey there! Thanks for reaching out about the ${listingTitle.slice(0, 24)}. How can I help you?`,
        `Hello! Yes, happy to answer any questions about the ${listingTitle.slice(0, 24)}. Are you looking to buy today?`,
        `Hi! Thanks for messaging. Let me know if you want to inspect it on campus!`
      );
    }
  }

  // =========================================================================
  // 7. FALLBACK / CLARIFICATION INTENT
  // =========================================================================
  else {
    if (isUserSeller) {
      possibleReplies.push(
        `Sounds good! Let me know when you'd be free to hand it over on campus.`,
        `Got it! Feel free to let me know the best time and spot to meet.`
      );
    } else {
      possibleReplies.push(
        `Could you clarify what you mean? Let me know if you'd like to check out the ${listingTitle.slice(0, 20)} on campus or have questions about price and condition!`,
        `Got it! Let me know if you want to schedule a meetup at ${pickupSpot} or need more details.`,
        `Sounds good! Feel free to ask about the price or suggest a campus meeting spot.`
      );
    }
  }

  // Anti-repetition: filter out the exact last reply if alternatives exist
  const filtered = possibleReplies.filter((r) => r !== lastReply);
  const pool = filtered.length > 0 ? filtered : possibleReplies;

  const chosen = pool[Math.floor(Math.random() * pool.length)];

  // Extra safety: ensure PIN is never leaked in mock replies
  return chosen.replace(/\b\d{4,6}\b/g, (match) => {
    // If it's a price number (e.g. ₹2000), keep it
    if (userText.includes(match) || askingPrice.toString() === match) return match;
    return '[Protected PIN]';
  });
}
