import GeneratedReport from '../models/generatedReport.model.js';
import ReportTemplate from '../models/reportTemplate.model.js';
import { errorHandler } from '../utils/error.js';
import { sendMail } from '../utils/mailer.js';

export const listReports = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, search = '', status } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const filter = { createdBy: req.user.id };
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { clientName: { $regex: search, $options: 'i' } },
        { propertyName: { $regex: search, $options: 'i' } },
        { templateName: { $regex: search, $options: 'i' } },
      ];
    }

    const [reports, total] = await Promise.all([
      GeneratedReport.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      GeneratedReport.countDocuments(filter),
    ]);

    res.json({ success: true, data: reports, total, page: Number(page) });
  } catch (err) {
    next(err);
  }
};

export const getReport = async (req, res, next) => {
  try {
    const report = await GeneratedReport.findOne({ _id: req.params.id, createdBy: req.user.id });
    if (!report) return next(errorHandler(404, 'Report not found'));
    res.json({ success: true, data: report });
  } catch (err) {
    next(err);
  }
};

export const createReport = async (req, res, next) => {
  try {
    const {
      templateId, templateName, templateType, templateSections,
      clientId, clientName, clientEmail, propertyName,
      listingId, notes, agentName, reportDate, html,
    } = req.body;

    if (!clientName) return next(errorHandler(400, 'Client name is required'));
    if (!propertyName) return next(errorHandler(400, 'Property name is required'));
    if (!html) return next(errorHandler(400, 'Report HTML is required'));

    const doc = await GeneratedReport.create({
      templateId: templateId || null,
      templateName: templateName || 'Custom Report',
      templateType: templateType || 'property_summary',
      templateSections: templateSections || [],
      clientId: clientId || null,
      clientName,
      clientEmail: clientEmail || '',
      propertyName,
      listingId: listingId || null,
      notes: notes || '',
      agentName: agentName || '',
      reportDate: reportDate || '',
      html,
      createdBy: req.user.id,
    });

    // Bump template usage count
    if (templateId) {
      ReportTemplate.findByIdAndUpdate(templateId, {
        $inc: { usageCount: 1 },
        lastUsed: new Date(),
      }).catch(() => {});
    }

    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    next(err);
  }
};

export const updateReport = async (req, res, next) => {
  try {
    const report = await GeneratedReport.findOne({ _id: req.params.id, createdBy: req.user.id });
    if (!report) return next(errorHandler(404, 'Report not found'));

    const allowed = [
      'templateId', 'templateName', 'templateType', 'templateSections',
      'clientId', 'clientName', 'clientEmail', 'propertyName',
      'listingId', 'notes', 'agentName', 'reportDate', 'html', 'status',
    ];
    for (const key of allowed) {
      if (req.body[key] !== undefined) report[key] = req.body[key];
    }
    await report.save();

    res.json({ success: true, data: report });
  } catch (err) {
    next(err);
  }
};

export const deleteReport = async (req, res, next) => {
  try {
    const doc = await GeneratedReport.findOneAndDelete({ _id: req.params.id, createdBy: req.user.id });
    if (!doc) return next(errorHandler(404, 'Report not found'));
    res.json({ success: true, message: 'Report deleted' });
  } catch (err) {
    next(err);
  }
};

export const sendReport = async (req, res, next) => {
  try {
    const report = await GeneratedReport.findOne({ _id: req.params.id, createdBy: req.user.id });
    if (!report) return next(errorHandler(404, 'Report not found'));

    const email = req.body.clientEmail || report.clientEmail;
    if (!email) return next(errorHandler(400, 'Client email is required'));

    const subject = `Property Report: ${report.propertyName}`;
    const text = `Dear ${report.clientName},\n\nPlease find your property report for ${report.propertyName}.\n\nReport: ${report.templateName}\n${report.notes ? `\nNotes: ${report.notes}` : ''}\n\nRegards,\n${report.agentName}`;

    const result = await sendMail({
      to: email,
      subject,
      html: report.html,
      text,
    });

    report.status = 'sent';
    report.sentAt = new Date();
    await report.save();

    res.json({ success: true, sent: result.sent, reason: result.reason, data: report });
  } catch (err) {
    next(err);
  }
};
