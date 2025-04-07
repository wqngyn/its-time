import { createEventObjects } from "./scrape.js";
import * as ics from "ics";
import * as fs from "fs";

const FILEPATH = "./exports/UFC.ics";

const createICSFiles = async () => {
  try {
    const eventObjects = await createEventObjects();
    if (eventObjects.length == 0 || !eventObjects)
      throw new Error("No event objects returned from createEventObjects()");
    console.log("Event objects retrieved...");

    const formattedEventObjects = eventObjects.map(formatEvents);
    if (formattedEventObjects.length == 0 || !formattedEventObjects)
      throw new Error(
        "No formatted event objects returned from formatEvents()"
      );
    console.log("Event objects formatted for ICS events...");

    const icsEvents = ics.createEvents(formattedEventObjects);
    if (!icsEvents.value)
      throw new Error("Error creating ICS event(s) from formattdEventObjects");
    console.log("ICS events created from formatted event objects...");

    const icsEventsWithTitle = icsEvents.value.replace(
      "BEGIN:VCALENDAR",
      "BEGIN:VCALENDAR\nX-WR-CALNAME: UFC"
    );
    fs.writeFileSync(FILEPATH, icsEventsWithTitle);
    console.log(`ICS successfully written to ${FILEPATH}`);
  } catch (err) {
    console.error(
      `Error occurred while creating ICS: ${err.stack || err.message}`
    );
  }
};

const formatEvents = (event) => {
  const formattedEvent = {
    start: event.startTime,
    duration: calculateDuration(event.startTime, event.endTime),
    title: event.headline,
    description: "",
    location: event.location,
    status: "CONFIRMED",
    busyStatus: "FREE",
  };
  if (event.main.notes) formattedEvent.description = event.main.notes;
  if (event.prelims.notes) formattedEvent.description += event.prelims.notes;
  if (event.earlyPrelims.notes)
    formattedEvent.description += event.earlyPrelims.notes;

  const localTime = getCurrentTime();
  formattedEvent.description += `${event.url}\n\nLast Updated ${localTime}`;

  return formattedEvent;
};

const getCurrentTime = () => {
  const now = new Date();
  const options = {
    month: "long",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Los_Angeles",
    timeZoneName: "short",
  };
  return now.toLocaleString("en-US", options);
};

const calculateDuration = (startDate, endDate) => {
  // Helper function to convert YYYYMMDDTHHmmssZ format to a Date object
  const parseDate = (dateStr) => {
    const year = dateStr.slice(0, 4);
    const month = dateStr.slice(4, 6) - 1;
    const day = dateStr.slice(6, 8);
    const hour = dateStr.slice(9, 11);
    const minute = dateStr.slice(11, 13);
    const second = dateStr.slice(13, 15);
    return new Date(Date.UTC(year, month, day, hour, minute, second));
  };

  // Parse the input date strings into Date objects
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const durationMs = end - start;

  // Return default object for negative duration
  if (durationMs < 0) {
    return { hours: 0, minutes: 0 };
  }

  const hours = Math.floor(durationMs / (1000 * 60 * 60)); // hours
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60)); // minutes
  return { hours, minutes };
};

createICSFiles();
