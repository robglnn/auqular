graph TD
    subgraph "Frontend (React Renderer)"
        UI[User Interface]
        Timeline[Timeline: Konva.js<br>Draggable Clips, Playhead, Trim Handles]
        Preview[Preview: HTML5 <video><br>Playback, Scrubbing, Sync]
        Import[Import: Drag/Drop, File Picker]
        ExportUI[Export Button: Progress UI]
        Recording[Screen/Webcam Recording:<br>desktopCapturer + getUserMedia (w/ Audio)<br>MediaRecorder for Blobs]
    end

    subgraph "Main Process (Node.js - Electron)"
        FS[File System Ops: fs, dialog for Read/Write/Save]
        FFmpegCmd[fluent-ffmpeg: Thumbnails, Trim, Export, Merge]
    end

    UI --> Timeline
    UI --> Preview
    UI --> Import
    UI --> ExportUI
    UI --> Recording

    Import -->|IPC to Main| FS
    Timeline -->|State Updates| Preview
    ExportUI -->|IPC Trigger| FFmpegCmd
    Recording -->|Save Blobs via IPC| FS
    FS -->|Paths/Blobs| Timeline
    FFmpegCmd -->|Output Files| FS
    FS -->|Return Paths| Preview

    classDef frontend fill:#f9f,stroke:#333,stroke-width:2px;
    classDef main fill:#bbf,stroke:#333,stroke-width:2px;
    class UI,Timeline,Preview,Import,ExportUI,Recording frontend;
    class FS,FFmpegCmd main;