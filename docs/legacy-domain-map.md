# Legacy Domain Map

This project was not only a generic order list. The WinForms dropdowns reveal a production system for joinery, furniture-adjacent stock control, supplier debt tracking, documentation, and shop-floor status control.

## Core Product Families

- PVC: `PVC 70AD`, `PVC 76MD`, `PVC 82MD`
- PVC/ALU: `PVC/ALU 70AD AK`, `PVC/ALU 76MD AK`, `PVC/ALU 82MD AK`
- ALU: `ALU 65TT`, `ALU 85TT`, `ALU 90TT`, `ALU 150K`, `ALU Fasada`
- Wood/ALU: `DRVO/ALU UniOne St.`, `DRVO/ALU Complanare`, `DRVO/ALU Maagis 40`

## Production Flow

`U PRIPREMI -> U PROIZVODNJI -> SREZANO -> OBRADJENO -> ZAVARENO -> OKOVANO -> POSTAKLANO -> SPAKOVANO -> POSLANO -> ISPORUCENO`

The old app also tracked elapsed production hours while moving through the active build states.

## Materials And Configuration

- Availability states: `PRIPREMA`, `DOSTUPNO`, `NARUCENO`
- Glass: DSL/TRL preparation, availability, and ordered states
- Panels: smooth/decorative preparation, availability, and ordered states
- Colors: Antrazit, Bianco, Golden Oak, Nussbaum, Marone, Pepper Oak, RAL colors, Rustic Oak, Schwarzbraun, Grezzo
- Hardware: Hope, Colombo, handles, caps, plugs, trims
- Warehouse categories: PVC/ALU/Wood profiles, reinforcement, handles, caps, plugs, single/double/triple glass, smooth/decorative panels, hinges, gaskets, screws, foils, surplus material
- Units: kg, m, m2, m3, komad, set

## Document Buckets

Sketches, cutting list, material specification, offer/contract, original measurements, profile orders, reinforcement orders, hardware orders, glass orders, panel orders, transport, export, proforma, and transport photos.

## Product Direction

The new app should treat the dropdowns as a production catalog and generate:

- 3D render from dimensions and selected materials
- Bill of materials and cut list
- Warehouse fit check from available stock dimensions
- Order creation from a rendered configuration
- Multilingual interface for regional and export workflows
