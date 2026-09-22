import CalendarEvent from '../models/calendarEvent.model.js';
import { errorHandler } from '../utils/error.js';

// Always the caller's own events: a calendar entry is personal.

export const listCalendarEvents = async (req, res, next) => {
  try {
    const events = await CalendarEvent.find({ user: req.user.id }).sort({ date: 1, time: 1 }).limit(2000).lean();
    res.status(200).json({ success: true, data: events });
  } catch (e) {
    next(e);
  }
};

export const createCalendarEvent = async (req, res, next) => {
  try {
    const { title, date, time, reminderMinutes } = req.body;
    const event = await CalendarEvent.create({ user: req.user.id, title, date, time, reminderMinutes });
    res.status(201).json({ success: true, data: event });
  } catch (e) {
    next(e);
  }
};

export const deleteCalendarEvent = async (req, res, next) => {
  try {
    const result = await CalendarEvent.deleteOne({ _id: req.params.id, user: req.user.id });
    if (!result.deletedCount) return next(errorHandler(404, 'Event not found'));
    res.status(200).json({ success: true });
  } catch (e) {
    next(e);
  }
};
