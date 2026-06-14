import ReportTemplate from '../models/reportTemplate.model.js';
import { errorHandler } from '../utils/error.js';
import { sendMail } from '../utils/mailer.js';

export const listTemplates = async (req, res, next) => {
  try {
    const templates = await ReportTemplate.find({ createdBy: req.user.id })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: templates });
  } catch (err) {
    next(err);
  }
};

export const createTemplate = async (req, res, next) => {
  try {
    const { name, type, description, sections } = req.body;
    if (!name) return next(errorHandler(400, 'Template name is required'));

    const doc = await ReportTemplate.create({
      name,
      type: type || 'property_summary',
      description: description || '',
      sections: sections || [],
      createdBy: req.user.id,
    });

    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
};

export const updateTemplate = async (req, res, next) => {
  try {
    const doc = await ReportTemplate.findOne({ _id: req.params.id, createdBy: req.user.id });
    if (!doc) return next(errorHandler(404, 'Template not found'));

    const { name, type, description, sections } = req.body;
    if (name !== undefined) doc.name = name;
    if (type !== undefined) doc.type = type;
    if (description !== undefined) doc.description = description;
    if (sections !== undefined) doc.sections = sections;
    await doc.save();

    res.json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
};

export const deleteTemplate = async (req, res, next) => {
  try {
    const doc = await ReportTemplate.findOneAndDelete({ _id: req.params.id, createdBy: req.user.id });
    if (!doc) return next(errorHandler(404, 'Template not found'));
    res.json({ success: true, message: 'Template deleted' });
  } catch (err) {
    next(err);
  }
};

export const incrementUsage = async (req, res, next) => {
  try {
    const doc = await ReportTemplate.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user.id },
      { $inc: { usageCount: 1 }, lastUsed: new Date() },
      { new: true }
    );
    if (!doc) return next(errorHandler(404, 'Template not found'));
    res.json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
};

export const sendReport = async (req, res, next) => {
  try {
    const template = await ReportTemplate.findById(req.params.id);
    if (!template) return next(errorHandler(404, 'Template not found'));

    const { clientEmail, clientName, propertyName, notes, reportHtml } = req.body;
    if (!clientEmail) return next(errorHandler(400, 'Client email is required'));

    const subject = `Property Report: ${propertyName || template.name}`;
    const text = `Dear ${clientName || 'Client'},\n\nPlease find your property report attached.\n\nProperty: ${propertyName || 'N/A'}\nTemplate: ${template.name}\n${notes ? `\nNotes: ${notes}` : ''}\n\nRegards`;

    const result = await sendMail({
      to: clientEmail,
      subject,
      html: reportHtml || `<p>Dear ${clientName || 'Client'},</p><p>Please find your property report for <strong>${propertyName}</strong>.</p>`,
      text,
    });

    // Increment usage
    await ReportTemplate.findByIdAndUpdate(req.params.id, {
      $inc: { usageCount: 1 },
      lastUsed: new Date(),
    });

    res.json({ success: true, sent: result.sent, reason: result.reason });
  } catch (err) {
    next(err);
  }
};
