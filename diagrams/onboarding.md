# New Member Onboarding Process

## Overview

This document describes the process for onboarding new members to the Caribbean Astronomy Society (SAC).

| Symbol                                                                                                                   | Description       |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| <svg width="40" height="40"><rect x="5" y="10" width="30" height="30" rx="0" fill="#FFFFFF" stroke="#1976D2"/></svg>     | State or Entity   |
| <svg width="40" height="40"><rect x="5" y="10" width="30" height="30" rx="15" fill="#FFE0B2" stroke="#FB8C00"/></svg>    | Manual Process    |
| <svg width="40" height="40"><rect x="5" y="10" width="30" height="30" rx="15" fill="#C8E6C9" stroke="#43A047"/></svg>    | Automatic Process |
| <svg width="40" height="40"><polygon points="5,25 12,15 28,15 35,25 28,35 12,35" fill="#BBDEFB" stroke="#1976D2"/></svg> | Script            |
| <svg width="40" height="40"><polygon points="20,15 35,25 20,35 5,25" fill="#E1BEE7" stroke="#8E24AA"/></svg>             | Decision          |
| <svg width="40" height="40"><polygon points="5,25 12,15 28,15 35,25 28,35 12,35" fill="#E0E0E0" stroke="#9E9E9E"/></svg> | To Be Refined     |

```mermaid
flowchart TD
    %% Initial state
    START[Candidate] --> FORM1(["fa:fa-user Complete Form (Candidate)"])
    START --> PAY1(["fa:fa-credit-card Make Payment (Candidate)"])

    %% Form branch - UPDATED
    FORM1 --> FORM2(["fa:fa-file-text Google Forms"])
    FORM2 --> RAW(["fa:fa-database Membership Form RAW"])
    RAW --> FORM3{{"fa:fa-check-circle Information Validation"}}
    FORM3 --> FORM4{Is Data Correct?}
    FORM4 -->|No| FORM5{{"fa:fa-envelope Validation Error Email"}}
    FORM5 --> FORM6(["fa:fa-hand Contact Candidate"])
    FORM4 -->|Yes| FORM7{{"fa:fa-arrow-right Upsert CLEAN [new]"}}
    FORM7 --> CLEAN(["fa:fa-database Membership Form CLEAN"])
    FORM7 --> PAYMENT_CHECK{{"fa:fa-money Verify Existing Payment"}}
    PAYMENT_CHECK --> PAYMENT_DECISION{Payment Confirmed?}
    PAYMENT_DECISION -->|Yes| ACTIVATE{{"fa:fa-cogs Activation Process"}}
    PAYMENT_DECISION -->|No| WAIT[Wait for Payment]

    %% Payment branch - Moved to right side
    PAY1 --> PAY2(["fa:fa-money ATHMovil/PayPal"])
    PAY2 --> PAY3(["fa:fa-file-text Payment Notification"])
    PAY3 --> PAY4{{"fa:fa-check-circle Payment Validation"}}
    PAY4 --> PAY5{Is Payment Correct?}

    %% Rearranged to minimize crossing
    PAY5 -->|Yes| PAYMENT_UPDATE{{"fa:fa-refresh Update CLEAN [paid]"}}
    PAYMENT_UPDATE --> CLEAN
    PAYMENT_UPDATE --> PAYMENT_CHECK

    PAY5 -->|No| PAY6{{"fa:fa-envelope Validation Error Email"}}
    PAY6 --> PAY7(["fa:fa-hand Contact Candidate"])

    %% Activation processes
    ACTIVATE --> ACT1{{"fa:fa-certificate Membership Certificate"}}
    ACTIVATE --> ACT2{{"fa:fa-file-text Welcome Letter"}}
    ACTIVATE --> ACT4{{"fa:fa-user-plus Create Google Account"}}
    ACTIVATE --> ACT5(["fa:fa-comments Add to WhatsApp"])

    ACT1 --> ACT3{{"fa:fa-envelope Welcome Email"}}
    ACT2 --> ACT3

    %% New update steps
    ACT3 --> UPDATE_WELCOME{{"fa:fa-refresh Update CLEAN [welcome]"}}
    UPDATE_WELCOME --> CLEAN
    UPDATE_WELCOME --> END1[Email Sent]

    ACT4 --> UPDATE_GOOGLE{{"fa:fa-refresh Update CLEAN [google]"}}
    UPDATE_GOOGLE --> CLEAN
    UPDATE_GOOGLE --> END2[Google Account Created]

    ACT5 --> ACT7(["fa:fa-comments Add to SAC Social"])
    ACT7 --> ACT8(["fa:fa-comments Welcome in WhatsApp"])
    ACT8 --> UPDATE_WHATSAPP(["fa:fa-refresh Update CLEAN [whatsapp]"])
    UPDATE_WHATSAPP --> CLEAN
    UPDATE_WHATSAPP --> END3[WhatsApp Integration Complete]

    %% Final completion
    END1 --> FINAL[Process Completed]
    END2 --> FINAL
    END3 --> FINAL

    %% Styling
    %% States (white background with blue border)
    style START fill:#FFFFFF,stroke:#1976D2,color:#1976D2
    style WAIT fill:#FFFFFF,stroke:#1976D2,color:#1976D2
    style END1 fill:#FFFFFF,stroke:#1976D2,color:#1976D2
    style END2 fill:#FFFFFF,stroke:#1976D2,color:#1976D2
    style END3 fill:#FFFFFF,stroke:#1976D2,color:#1976D2
    style FINAL fill:#FFFFFF,stroke:#1976D2,color:#1976D2

    %% Manual processes (light orange)
    style FORM1 fill:#FFE0B2,stroke:#FB8C00,color:#000000
    style PAY1 fill:#FFE0B2,stroke:#FB8C00,color:#000000
    style FORM6 fill:#FFE0B2,stroke:#FB8C00,color:#000000
    style PAY7 fill:#FFE0B2,stroke:#FB8C00,color:#000000
    style ACT5 fill:#FFE0B2,stroke:#FB8C00,color:#000000
    style ACT7 fill:#FFE0B2,stroke:#FB8C00,color:#000000
    style ACT8 fill:#FFE0B2,stroke:#FB8C00,color:#000000
    style UPDATE_WHATSAPP fill:#FFE0B2,stroke:#FB8C00,color:#000000

    %% Automated processes (rounded rectangle with light green)
    style FORM2 fill:#C8E6C9,stroke:#43A047,color:#000000
    style RAW fill:#C8E6C9,stroke:#43A047,color:#000000
    style PAY2 fill:#C8E6C9,stroke:#43A047,color:#000000
    style PAY3 fill:#C8E6C9,stroke:#43A047,color:#000000
    style CLEAN fill:#C8E6C9,stroke:#43A047,color:#000000

    %% Script processes (hexagon with light blue)
    style FORM3 fill:#BBDEFB,stroke:#1976D2,color:#000000
    style FORM5 fill:#BBDEFB,stroke:#1976D2,color:#000000
    style FORM7 fill:#BBDEFB,stroke:#1976D2,color:#000000
    style PAYMENT_CHECK fill:#BBDEFB,stroke:#1976D2,color:#000000
    style PAYMENT_UPDATE fill:#BBDEFB,stroke:#1976D2,color:#000000
    style PAY4 fill:#BBDEFB,stroke:#1976D2,color:#000000
    style PAY6 fill:#BBDEFB,stroke:#1976D2,color:#000000
    style ACTIVATE fill:#BBDEFB,stroke:#1976D2,color:#000000
    style ACT3 fill:#BBDEFB,stroke:#1976D2,color:#000000
    style ACT4 fill:#BBDEFB,stroke:#1976D2,color:#000000
    style UPDATE_WELCOME fill:#BBDEFB,stroke:#1976D2,color:#000000
    style UPDATE_GOOGLE fill:#BBDEFB,stroke:#1976D2,color:#000000

    %% To be refined (light gray)
    style ACT1 fill:#E0E0E0,stroke:#9E9E9E,color:#000000
    style ACT2 fill:#E0E0E0,stroke:#9E9E9E,color:#000000

    %% Decision points (light purple)
    style FORM4 fill:#E1BEE7,stroke:#8E24AA,color:#000000
    style PAYMENT_DECISION fill:#E1BEE7,stroke:#8E24AA,color:#000000
    style PAY5 fill:#E1BEE7,stroke:#8E24AA,color:#000000
```
