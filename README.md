# P-DetSi Lab - Signal Analyzer & Distributions v10

**P-DetSi Lab** is a powerful web-based tool for analyzing time-series signal data, detecting peaks, and performing statistical distribution analysis.

## Key Features
-   **CSV Data Import**: Load large signal datasets efficiently.
-   **Interactive Visualization**: Zoom, pan, and inspect signal data with high performance.
-   **Peak Detection**: Automated threshold-based detection and manual labeling.
-   **Class Management**: Define custom classes for different signal regions.
-   **Statistical Analysis**: Real-time calculation of Width, Max Voltage, and Area for detected regions.
-   **Distribution Analysis**: Histogram and distribution fitting for analyzed metrics.

## Interface Overview

### 1. Main Analysis View
The central workspace for visualizing signals.
-   **Toolbar**: Controls for loading files, setting window size (N), stride, and playback speed.
-   **Signal Graph**: The main chart displaying the loaded signal (blue) and any smoothing (orange).
-   **Navigation**: Slider and buttons to traverse the signal in windows.
-   **Analysis Table**: Lists all detected regions with their properties (Class, Start, End, Width, Max Voltage, Area).

![Main View](docs/main_view.png)

### 2. Manage Classes
Customize the labels used for annotation.
-   **Add Class**: Create new label types with custom names and colors.
-   **Buttons**: Quickly switch between active labeling classes.
-   **Convert Labels**: (New) Bulk convert existing labels from one class to another.

![Manage Classes Modal](docs/manage_classes.png)

### 3. Analysis & Distribution
Visualize the statistical properties of detected events.
-   **Analysis Table**: Lists all detected regions with their properties.
-   **Refresh Analysis**: Updates the table after labeling changes.
-   **Histograms**: View distribution of Peak Widths, Voltages, and Areas.

![Analysis Controls](docs/analysis_header.png)

### 4. SG Optimizer Wizard
A tool to help select optimal Savitzky-Golay filter parameters.
-   **Preview**: See the effect of window size and polynomial order on a sample of your data.
-   **MSE Calculation**: Real-time error estimation to find the best smoothing settings.

## Getting Started
1.  Open `sinyal izleyici.html` in a modern web browser (Edge/Chrome recommended).
2.  Click **"Load CSV"** to select your data file.
3.  Use the **Window Size** input to adjust the view range.
4.  Click and drag on the graph to annotate regions, or use **Threshold Detection** to auto-find peaks.
5.  Click **"Refresh Analysis"** to update the table and distributions.

---
*Created by P-DetSi Lab Team*
