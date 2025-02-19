# Proceso de Incorporación de Nuevos Miembros

## Descripción General

Este documento describe el proceso de incorporación de nuevos miembros a la Sociedad de Astronomía del Caribe (SAC).

| Símbolo                                                                                                                  | Descripción        |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| <svg width="40" height="40"><rect x="5" y="10" width="30" height="30" rx="0" fill="#FFFFFF" stroke="#1976D2"/></svg>     | Estado o Entidad   |
| <svg width="40" height="40"><rect x="5" y="10" width="30" height="30" rx="15" fill="#FFE0B2" stroke="#FB8C00"/></svg>    | Proceso Manual     |
| <svg width="40" height="40"><polygon points="5,25 12,15 28,15 35,25 28,35 12,35" fill="#C8E6C9" stroke="#43A047"/></svg> | Proceso Automático |
| <svg width="40" height="40"><polygon points="20,15 35,25 20,35 5,25" fill="#E1BEE7" stroke="#8E24AA"/></svg>             | Decisión           |

```mermaid
flowchart TD
    %% Initial state
    START[Candidato] --> FORM1(["fa:fa-user Completar Formulario (Candidato)"])
    START --> PAY1(["fa:fa-credit-card Realizar Pago (Candidato)"])

    %% Form branch
    FORM1 --> FORM2{{"fa:fa-file-text Formulario Membresía"}}
    FORM2 --> FORM3{{"fa:fa-check-circle Validación de Información"}}
    FORM3 --> FORM4{¿Datos Correctos?}
    FORM4 -->|No| FORM5{{"fa:fa-envelope Validation Error Email"}}
    FORM5 --> FORM6(["fa:fa-hand Contactar Candidato"])
    FORM6 --> FORM3
    FORM4 -->|Sí| FORM7[Datos Correctos]
    FORM7 --> ACTIVATE{{"fa:fa-cogs Proceso de Activación"}}

    %% Payment branch
    PAY1 --> PAY2{{"fa:fa-money ATHMovil/PayPal"}}
    PAY2 --> PAY3{{"fa:fa-file-text Notificación de Pago"}}
    PAY3 --> PAY4{{"fa:fa-check-circle Validación de Pago"}}
    PAY4 --> PAY5{¿Pago Correcto?}
    PAY5 -->|No| PAY6{{"fa:fa-envelope Validation Error Email"}}
    PAY6 --> PAY7(["fa:fa-hand Contactar Candidato"])
    PAY7 --> PAY4
    PAY5 -->|Sí| PAY8[Pago Correcto]
    PAY8 --> ACTIVATE

    %% Activation processes
    ACTIVATE --> ACT1{{"fa:fa-certificate Certificado de Membresía"}}
    ACTIVATE --> ACT2{{"fa:fa-file-text Carta de Bienvenida"}}
    ACTIVATE --> ACT4{{"fa:fa-user-plus Crear Cuenta Google"}}
    ACTIVATE --> ACT5(["fa:fa-comments Añadir a WhatsApp"])

    ACT1 --> ACT3{{"fa:fa-envelope Email Bienvenida"}}
    ACT2 --> ACT3
    ACT3 --> END[Proceso Completado]
    ACT4 --> END
    ACT5 --> ACT7(["fa:fa-comments Añadir a SAC Social"])
    ACT7 --> ACT8(["fa:fa-comments Dar Bienvenida en WhatsApp"])
    ACT8 --> END

    %% Styling
    %% States (white background with blue border)
    style START fill:#FFFFFF,stroke:#1976D2,color:#1976D2
    style FORM7 fill:#FFFFFF,stroke:#1976D2,color:#1976D2
    style PAY8 fill:#FFFFFF,stroke:#1976D2,color:#1976D2
    style END fill:#FFFFFF,stroke:#1976D2,color:#1976D2

    %% Manual processes (light orange)
    style FORM1 fill:#FFE0B2,stroke:#FB8C00,color:#000000
    style PAY1 fill:#FFE0B2,stroke:#FB8C00,color:#000000
    style FORM6 fill:#FFE0B2,stroke:#FB8C00,color:#000000
    style PAY7 fill:#FFE0B2,stroke:#FB8C00,color:#000000
    style ACT5 fill:#FFE0B2,stroke:#FB8C00,color:#000000
    style ACT7 fill:#FFE0B2,stroke:#FB8C00,color:#000000
    style ACT8 fill:#FFE0B2,stroke:#FB8C00,color:#000000

    %% Automated processes (light green)
    style FORM2 fill:#C8E6C9,stroke:#43A047,color:#000000
    style FORM3 fill:#C8E6C9,stroke:#43A047,color:#000000
    style FORM5 fill:#C8E6C9,stroke:#43A047,color:#000000
    style PAY2 fill:#C8E6C9,stroke:#43A047,color:#000000
    style PAY3 fill:#C8E6C9,stroke:#43A047,color:#000000
    style PAY4 fill:#C8E6C9,stroke:#43A047,color:#000000
    style PAY6 fill:#C8E6C9,stroke:#43A047,color:#000000
    style ACTIVATE fill:#C8E6C9,stroke:#43A047,color:#000000
    style ACT1 fill:#C8E6C9,stroke:#43A047,color:#000000
    style ACT2 fill:#C8E6C9,stroke:#43A047,color:#000000
    style ACT3 fill:#C8E6C9,stroke:#43A047,color:#000000
    style ACT4 fill:#C8E6C9,stroke:#43A047,color:#000000

    %% Decision points (light purple)
    style FORM4 fill:#E1BEE7,stroke:#8E24AA,color:#000000
    style PAY5 fill:#E1BEE7,stroke:#8E24AA,color:#000000
```

### 1. Solicitud Inicial

- El candidato completa el formulario de membresía en Google Forms
- La información se almacena automáticamente en una hoja de cálculo de Google
- El sistema envía una notificación por correo electrónico

### 2. Pago de Membresía

- El candidato realiza el pago a través de:
  - ATHMovil
  - PayPal
- La plataforma de pago envía una notificación por correo electrónico

### 3. Validación de Información

- Se requiere validar la información del formulario
- Se verifica que los datos estén completos y sean correctos
- En caso de inconsistencias:
  - Se debe contactar al candidato para aclaraciones
  - Se actualiza la información en la hoja de cálculo limpia

### 4. Validación de Pago

- Se requiere verificar:
  - La recepción del pago
  - Que el monto sea correcto
- Se marca el estado como "pagado" en la hoja de cálculo limpia

### 5. Proceso de Activación

Una vez validados tanto el perfil como el pago, se procede con:

#### 5.1 Envío de Documentación

- Se genera y envía correo electrónico de bienvenida que incluye:
  - Certificado de Membresía (generado)
  - Carta de Bienvenida (generada)
  - Calendario del mes actual (estático)

#### 5.2 Creación de Cuenta Institucional

- Se genera cuenta de Google Workspace
- Formato del correo: nombre.apellido@sociedadastronomia.com

#### 5.3 Integración a Grupos de Comunicación

- Se añade al nuevo miembro al grupo de WhatsApp de la comunidad
- Se incorpora al miembro al canal SAC Social
- Se envía mensaje de bienvenida en el canal SAC Social
