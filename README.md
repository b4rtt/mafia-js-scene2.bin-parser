# Scene2Parser - Mafia: The City of Lost Heaven Scene Editor

Web-based editor for `scene2.bin` files from Mafia: The City of Lost Heaven. This tool allows you to view, edit, and save scene data including objects, enemies, lights, sounds, cameras, and more.

## Features

- 📋 **Complete Scene Parsing** - Parse and display all sections and objects from scene2.bin files
- 🔍 **Hierarchical Tree View** - Navigate through sections, object types, and individual objects
- ✏️ **Property Editing** - Edit all object properties including:
  - Transform properties (Position, Rotation, Scale)
  - Enemy statistics (Strength, Speed, Aggressivity, Intelligence, etc.)
  - Light properties (Power, Color, Cone, Radius)
  - Sound properties (Volume, Pitch, Radius, Falloff)
  - Camera properties (FOV)
  - Header properties (View Distance, Camera Distance, Clipping)
- 🎯 **Filtering** - Filter objects by type within sections
- 💾 **Save Changes** - Save modified scenes back to binary format
- 📊 **Real-time Updates** - See changes reflected immediately
- 📝 **Console Logging** - Track all operations and changes

## Supported Object Types

- **Standard Objects** - Basic objects with transform properties
- **Models** - 3D models with mesh references
- **Enemies** - NPCs with statistics, energy, and behavior properties
- **Lights** - Point, Spot, Directional, Ambient, and Fog lights
- **Sounds** - Audio sources with volume, pitch, and radius settings
- **Cameras** - Camera objects with FOV settings
- **Occluders** - Geometry for occlusion culling
- **Scripts** - Lua script objects
- **Headers** - Scene header with view and camera settings

## Usage

### Opening a File

1. Click **File** in the menu bar or use the **Open** button
2. Select a `scene2.bin` file from your Mafia game directory
3. The scene will be parsed and displayed

### Navigating the Scene

- **Tree View (Left Sidebar)**:
  - Expand sections to see object types
  - Expand object types to see individual objects
  - Click on any node to view its properties
  - Use "All Sections" to return to the full scene view

- **Filter Panel**:
  - When viewing a section, filters appear below statistics
  - Click "All" to show all objects
  - Click a specific type to filter by that type
  - Use "← Back" to return to all sections view

### Editing Properties

1. Select an object from the tree view or click on an object card
2. Properties appear in the right panel
3. Click on any numeric input field to edit
4. Press Enter or click outside to apply changes
5. Changes are tracked automatically

### Saving Changes

1. After making edits, the **Save** and **Save As** buttons become enabled
2. Click **Save** to overwrite the original file
3. Click **Save As** to save with a different name
4. The modified binary file will be downloaded

## File Structure

```
Scene2Parser/
├── index.html          # Main HTML file with UI
├── scene2parser.js    # Parser and editor logic
└── README.md          # This file
```

## Technical Details

### Binary Format

The `scene2.bin` file structure:
- **Header** - Magic bytes, size, and scene settings
- **Sections** - Multiple sections containing DNC (Dynamic Node Component) objects
- **DNC Objects** - Individual objects with type-specific properties

### Editing Process

1. **Parsing**: Binary data is read and converted to JavaScript objects
2. **Editing**: Properties are modified in memory
3. **Updating**: Changes are written back to the raw binary data using offsets
4. **Saving**: The entire binary file is reconstructed from modified data

### Supported Property Types

- **Float32** - Position, rotation, scale, distances, angles
- **Int32** - IDs, flags, counts
- **Uint8** - Boolean flags, small integers
- **Strings** - Object names, model paths, script text

## Browser Compatibility

- Modern browsers with ES6+ support
- Tested on Chrome, Firefox, Edge, Safari
- Requires File API support for file operations

## Notes

- Always backup your original `scene2.bin` files before editing
- Some properties may be read-only (strings, complex structures)
- The editor validates data ranges to prevent corruption
- Changes are tracked and can be saved at any time

## License

This project is provided as-is for educational and modding purposes.

## Credits

Based on the original C# Scene2Parser implementation. Adapted for web use with enhanced UI and editing capabilities.

## Contributing

Feel free to submit issues or improvements for:
- Additional object types
- New editable properties
- UI/UX improvements
- Bug fixes

