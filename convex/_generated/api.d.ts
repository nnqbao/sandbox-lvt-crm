/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as assignmentPolicy from "../assignmentPolicy.js";
import type * as attendanceImport from "../attendanceImport.js";
import type * as attendanceImportSheet from "../attendanceImportSheet.js";
import type * as attendanceImportValidate from "../attendanceImportValidate.js";
import type * as auth from "../auth.js";
import type * as boarding from "../boarding.js";
import type * as chatAudience from "../chatAudience.js";
import type * as chatGroupAccess from "../chatGroupAccess.js";
import type * as chatHub from "../chatHub.js";
import type * as chatHubPolicy from "../chatHubPolicy.js";
import type * as chatInbox from "../chatInbox.js";
import type * as chatMessagePolicy from "../chatMessagePolicy.js";
import type * as chatNotifications from "../chatNotifications.js";
import type * as classOrder from "../classOrder.js";
import type * as departments from "../departments.js";
import type * as designLibrary from "../designLibrary.js";
import type * as documentTypePolicy from "../documentTypePolicy.js";
import type * as documentTypes from "../documentTypes.js";
import type * as driveUploadStages from "../driveUploadStages.js";
import type * as duties from "../duties.js";
import type * as dutyApproval from "../dutyApproval.js";
import type * as dutyChangeLog from "../dutyChangeLog.js";
import type * as dutyImport from "../dutyImport.js";
import type * as dutyImportParse from "../dutyImportParse.js";
import type * as dutyImportSheet from "../dutyImportSheet.js";
import type * as dutyImportValidate from "../dutyImportValidate.js";
import type * as dutyMessagePolicy from "../dutyMessagePolicy.js";
import type * as dutyMessages from "../dutyMessages.js";
import type * as dutyRange from "../dutyRange.js";
import type * as dutyWeekStore from "../dutyWeekStore.js";
import type * as dutyWeeks from "../dutyWeeks.js";
import type * as dutyWritePolicy from "../dutyWritePolicy.js";
import type * as entityCodes from "../entityCodes.js";
import type * as groupMessages from "../groupMessages.js";
import type * as homeroomAlerts from "../homeroomAlerts.js";
import type * as homeroomCatalog from "../homeroomCatalog.js";
import type * as homeroomClasses from "../homeroomClasses.js";
import type * as homeroomContext from "../homeroomContext.js";
import type * as homeroomData from "../homeroomData.js";
import type * as homeroomPolicy from "../homeroomPolicy.js";
import type * as homeroomReportPolicy from "../homeroomReportPolicy.js";
import type * as homeroomReports from "../homeroomReports.js";
import type * as homeroomTime from "../homeroomTime.js";
import type * as http from "../http.js";
import type * as lib from "../lib.js";
import type * as locations from "../locations.js";
import type * as loginSecurity from "../loginSecurity.js";
import type * as mail from "../mail.js";
import type * as mailTransport from "../mailTransport.js";
import type * as menuAccess from "../menuAccess.js";
import type * as moderatorScope from "../moderatorScope.js";
import type * as notificationSettings from "../notificationSettings.js";
import type * as notifications from "../notifications.js";
import type * as peopleReview from "../peopleReview.js";
import type * as permissionGroups from "../permissionGroups.js";
import type * as personalReminderPolicy from "../personalReminderPolicy.js";
import type * as personalReminders from "../personalReminders.js";
import type * as personalTodoPolicy from "../personalTodoPolicy.js";
import type * as personalTodos from "../personalTodos.js";
import type * as positions from "../positions.js";
import type * as push from "../push.js";
import type * as pushActions from "../pushActions.js";
import type * as pushPayload from "../pushPayload.js";
import type * as reports from "../reports.js";
import type * as schoolYears from "../schoolYears.js";
import type * as seed from "../seed.js";
import type * as sessions from "../sessions.js";
import type * as settings from "../settings.js";
import type * as staffFaultsPolicy from "../staffFaultsPolicy.js";
import type * as studentAttendance from "../studentAttendance.js";
import type * as studentAttendancePolicy from "../studentAttendancePolicy.js";
import type * as studentRosterImport from "../studentRosterImport.js";
import type * as studentRosterImportParse from "../studentRosterImportParse.js";
import type * as studentRosterImportSheet from "../studentRosterImportSheet.js";
import type * as studentRosterImportValidate from "../studentRosterImportValidate.js";
import type * as students from "../students.js";
import type * as supervisorAttendance from "../supervisorAttendance.js";
import type * as supervisorAttendanceParse from "../supervisorAttendanceParse.js";
import type * as supervisorAttendancePolicy from "../supervisorAttendancePolicy.js";
import type * as userAvatar from "../userAvatar.js";
import type * as userAvatarPolicy from "../userAvatarPolicy.js";
import type * as userImport from "../userImport.js";
import type * as userImportParse from "../userImportParse.js";
import type * as userImportPolicy from "../userImportPolicy.js";
import type * as userImportSheet from "../userImportSheet.js";
import type * as userImportValidate from "../userImportValidate.js";
import type * as users from "../users.js";
import type * as work from "../work.js";
import type * as workDocumentPolicy from "../workDocumentPolicy.js";
import type * as workMessagePolicy from "../workMessagePolicy.js";
import type * as workMessages from "../workMessages.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  assignmentPolicy: typeof assignmentPolicy;
  attendanceImport: typeof attendanceImport;
  attendanceImportSheet: typeof attendanceImportSheet;
  attendanceImportValidate: typeof attendanceImportValidate;
  auth: typeof auth;
  boarding: typeof boarding;
  chatAudience: typeof chatAudience;
  chatGroupAccess: typeof chatGroupAccess;
  chatHub: typeof chatHub;
  chatHubPolicy: typeof chatHubPolicy;
  chatInbox: typeof chatInbox;
  chatMessagePolicy: typeof chatMessagePolicy;
  chatNotifications: typeof chatNotifications;
  classOrder: typeof classOrder;
  departments: typeof departments;
  designLibrary: typeof designLibrary;
  documentTypePolicy: typeof documentTypePolicy;
  documentTypes: typeof documentTypes;
  driveUploadStages: typeof driveUploadStages;
  duties: typeof duties;
  dutyApproval: typeof dutyApproval;
  dutyChangeLog: typeof dutyChangeLog;
  dutyImport: typeof dutyImport;
  dutyImportParse: typeof dutyImportParse;
  dutyImportSheet: typeof dutyImportSheet;
  dutyImportValidate: typeof dutyImportValidate;
  dutyMessagePolicy: typeof dutyMessagePolicy;
  dutyMessages: typeof dutyMessages;
  dutyRange: typeof dutyRange;
  dutyWeekStore: typeof dutyWeekStore;
  dutyWeeks: typeof dutyWeeks;
  dutyWritePolicy: typeof dutyWritePolicy;
  entityCodes: typeof entityCodes;
  groupMessages: typeof groupMessages;
  homeroomAlerts: typeof homeroomAlerts;
  homeroomCatalog: typeof homeroomCatalog;
  homeroomClasses: typeof homeroomClasses;
  homeroomContext: typeof homeroomContext;
  homeroomData: typeof homeroomData;
  homeroomPolicy: typeof homeroomPolicy;
  homeroomReportPolicy: typeof homeroomReportPolicy;
  homeroomReports: typeof homeroomReports;
  homeroomTime: typeof homeroomTime;
  http: typeof http;
  lib: typeof lib;
  locations: typeof locations;
  loginSecurity: typeof loginSecurity;
  mail: typeof mail;
  mailTransport: typeof mailTransport;
  menuAccess: typeof menuAccess;
  moderatorScope: typeof moderatorScope;
  notificationSettings: typeof notificationSettings;
  notifications: typeof notifications;
  peopleReview: typeof peopleReview;
  permissionGroups: typeof permissionGroups;
  personalReminderPolicy: typeof personalReminderPolicy;
  personalReminders: typeof personalReminders;
  personalTodoPolicy: typeof personalTodoPolicy;
  personalTodos: typeof personalTodos;
  positions: typeof positions;
  push: typeof push;
  pushActions: typeof pushActions;
  pushPayload: typeof pushPayload;
  reports: typeof reports;
  schoolYears: typeof schoolYears;
  seed: typeof seed;
  sessions: typeof sessions;
  settings: typeof settings;
  staffFaultsPolicy: typeof staffFaultsPolicy;
  studentAttendance: typeof studentAttendance;
  studentAttendancePolicy: typeof studentAttendancePolicy;
  studentRosterImport: typeof studentRosterImport;
  studentRosterImportParse: typeof studentRosterImportParse;
  studentRosterImportSheet: typeof studentRosterImportSheet;
  studentRosterImportValidate: typeof studentRosterImportValidate;
  students: typeof students;
  supervisorAttendance: typeof supervisorAttendance;
  supervisorAttendanceParse: typeof supervisorAttendanceParse;
  supervisorAttendancePolicy: typeof supervisorAttendancePolicy;
  userAvatar: typeof userAvatar;
  userAvatarPolicy: typeof userAvatarPolicy;
  userImport: typeof userImport;
  userImportParse: typeof userImportParse;
  userImportPolicy: typeof userImportPolicy;
  userImportSheet: typeof userImportSheet;
  userImportValidate: typeof userImportValidate;
  users: typeof users;
  work: typeof work;
  workDocumentPolicy: typeof workDocumentPolicy;
  workMessagePolicy: typeof workMessagePolicy;
  workMessages: typeof workMessages;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
