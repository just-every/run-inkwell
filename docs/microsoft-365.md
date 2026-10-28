# Microsoft 365

Microsoft 365 is partial. The native connector supports Graph-backed document loading and explicit reply intake. Installed Office registration and signed subscription notifications are not available yet. Microsoft tenant provisioning and live operation have not been established.

An installation administrator configures `MICROSOFT_GRAPH_ACCESS_TOKEN` through the installation's private environment. Keep credentials out of browser code, documents, screenshots and archives. The conservative connection default permits only signed-in owners and admins to read the connected installation mailbox or drive; CT approval of that default is pending.

In Prepare, open **Pick from Microsoft 365**. Choose OneDrive, SharePoint, an Outlook message or Word. The Outlook host harness obtains the open message ID from the Office context; the Word host harness obtains the open document URL. Resource identifiers can also be supplied directly. Graph supplies the actual PDF bytes and Outlook participants. Review the loaded filename, recipient proposals and placed fields. Choosing **Sign it myself** selects the signed-in member. Saving creates a draft and sends no invitation.

The Microsoft send policy starts off. An owner or admin enables it in Settings. Sending always requires native eligibility confirmation and retains current policy, internal approval and scheduling checks. Self-signing uses the existing in-app session and sends no invitation, code or completed copy to the member.

For automatic completion filing, configure an existing SharePoint folder under Settings, Automatic filing. Enter the drive ID, a colon and the folder ID, then explicitly authorize transfer for a template. Choose that filing template when loading a Microsoft source; its PDF must match exactly. Completion queues the executed PDF and certificate. A lost response stays unconfirmed; an explicit retry verifies remote bytes and refuses conflicting content rather than overwriting it. Disabling the rule cancels remaining queued transfers. Remote copies are outside local erasure.

The native `POST /api/inkwell/microsoft/source` door takes the selected kind and either drive and item identifiers, an Outlook message identifier, or the open Word URL. Preparation takes the returned `microsoftUploadId`; it refuses an altered displayed PDF. A Word URL must belong to a Microsoft SharePoint or OneDrive host. Download redirects currently refuse safely; direct Graph PDF responses are supported.

The native `POST /api/inkwell/microsoft/replies` door takes a Graph message identifier. It fetches the message itself; callers cannot submit reply text or sender facts. Only a fresh message addressed to a current AGENT-003 reply capability is accepted, and the member must already be a permitted reply reader. Replays refuse. Unverified senders cannot pause or redirect follow-up. Reply text stays out of audit logs and certificates; ordinary envelope archive and erasure custody applies. This explicit intake does not claim an automatic Outlook subscription.

Restoring an archive preserves business evidence without restoring provider credentials, filing rules, queued transfers or active reply capabilities. It never starts external Microsoft activity.
