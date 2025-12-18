import * as pdfjsLib from "pdfjs-dist";

// Configure PDF.js worker for Vite - use worker from node_modules to ensure version match
// Use jsDelivr CDN which is more reliable than unpkg/cdnjs for worker files
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.449/build/pdf.worker.min.mjs';
}

/**
 * Parse room_num_type.pdf to extract room numbers, types, and floors
 * Expected format: room numbers like 101, 102, etc. and types like D5, S1, etc.
 */
export async function parseRoomPDF(pdfPath) {
  try {
    const response = await fetch(pdfPath);
    const arrayBuffer = await response.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let allText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(" ");
      allText += " " + pageText;
    }

    // Extract room numbers (3-digit: 101-699)
    const roomMatches = allText.match(/\b[1-6]\d{2}\b/g) || [];
    const roomNumbers = [...new Set(roomMatches)];
    
    // Extract room types (patterns like D5, D6, S1, S2, etc.)
    // Look for patterns: letter(s) followed by number
    const typePattern = /([DS]\d+|[A-Z]\d+)/gi;
    const typeMatches = allText.match(typePattern) || [];
    
    // Create rooms array
    const rooms = roomNumbers.map(number => {
      // Extract floor from room number (first digit)
      const floor = parseInt(number[0]);
      
      // Try to find type near the room number in text
      // Look for type pattern before or after room number
      const roomIndex = allText.indexOf(number);
      let type = "D5"; // default
      
      if (roomIndex !== -1) {
        // Search 50 chars before and after room number
        const context = allText.substring(
          Math.max(0, roomIndex - 50),
          Math.min(allText.length, roomIndex + 50)
        );
        const nearbyType = context.match(typePattern);
        if (nearbyType && nearbyType.length > 0) {
          // Use the closest type match
          type = nearbyType[0].toUpperCase();
        }
      }
      
      return {
        number,
        type,
        floor,
        status: "vacant",
        maid: "",
        remark: "",
        cleanedToday: false, // Track if cleaned today for scoring
      };
    });

    // Sort by floor (descending) then by room number
    rooms.sort((a, b) => {
      if (a.floor !== b.floor) return b.floor - a.floor; // Floor 6 first
      return parseInt(a.number) - parseInt(b.number);
    });

    return rooms;
  } catch (error) {
    console.error("Error parsing room PDF:", error);
    // Return default rooms if PDF parsing fails
    return [
      { number: "101", type: "D5", floor: 1, status: "vacant", maid: "", remark: "", cleanedToday: false },
      { number: "102", type: "D5", floor: 1, status: "vacant", maid: "", remark: "", cleanedToday: false },
      { number: "201", type: "D5", floor: 2, status: "vacant", maid: "", remark: "", cleanedToday: false },
      { number: "202", type: "D5", floor: 2, status: "vacant", maid: "", remark: "", cleanedToday: false },
    ];
  }
}
