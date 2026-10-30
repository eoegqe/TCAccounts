export const TC_NOTIFICATION_TEMPLATES = {
  accountCreated: {
    subject: "Welcome to Theegget Creations",
    render: ({ username }) => `Hello, ${username}

Your TC account has been successfully created.

You can now use your TC account to access supported Theegget Creations services.

Best, TC`
  },
  subAccountTypePersonal: {
    subject: "TC Sub-Account security notification",
    render: ({ username }) => `Hello, ${username}

Your Sub-Account has been converted to a personal sub-account as requested.

If this wasn't you then contact:
support@theegget.com

If this was you you can safely ignore this email

Best, TC`
  },
  subAccountTypeShared: {
    subject: "TC Sub-Account security notification",
    render: ({ username }) => `Hello, ${username}

Your Sub-Account has been converted to a shared sub-account as requested.

If this wasn't you then contact:
support@theegget.com

If this was you you can safely ignore this email

Best, TC`
  },
  subAccountCreated: {
    subject: "TC sub account successfully created",
    render: ({ username, subusername, service }) => `Hello, ${username}

A sub account with the username @${subusername} has been created under your account as requested for ${service}

If you did not request this contact support@theegget.com

Best, TC`
  },
  subAccountPermanentlyBanned: {
    subject: "TC sub account notification",
    render: ({ username, subusername, service }) => `Hello, ${username}

The sub account @${subusername} associated with ${service} has been permanently banned from ${service}

If you believe this action was made in error, please contact support@theegget.com

Best, TC`
  },
  accountDeletionRequested: {
    subject: "TC Account Deletion Request",
    render: ({ username }) => `Hello, ${username}

A request has been made to delete your TC account.

Your account will be scheduled for deletion after a 14-day waiting period.

You can cancel this request at any time during the waiting period by signing into your TC account.

After the waiting period, your account will enter the recovery stage, where you can still recover it if you change your mind.

If you did not request this deletion, please sign in and cancel the request immediately.

Best, TC`
  },
  accountDeletionCancelled: {
    subject: "TC Account Deletion Cancelled",
    render: ({ username }) => `Hello, ${username}

Your TC account deletion request has been successfully cancelled.

Your account will remain active, and you can continue using Theegget Creations services as usual.

We're glad you're staying with TC!

Best, TC`
  },
  accountRecoveryAvailable: {
    subject: "TC Account Recovery Available",
    render: ({ username }) => `Hello, ${username}

Your TC account has entered the recovery stage following the 14-day deletion waiting period.

You can still recover your account by contacting TC Support at support@theegget.com.

If you intended to permanently delete your account, no further action is required.

Best, TC`
  },
  accountRecovered: {
    subject: "TC Account Recovered",
    render: ({ username }) => `Hello, ${username}

Your TC account has been successfully recovered.

Your account is active again, and you can continue using Theegget Creations services as usual.

Welcome back!

Best, TC`
  },
  applicationAuthorized: {
    subject: "TC Security Notification",
    render: ({ username, application }) => `Hello, ${username}

A new application has been authorized to access your TC account.

Application: ${application}

If you did not authorize this application, we recommend revoking its access to your TC account immediately.

Best, TC`
  }
};
