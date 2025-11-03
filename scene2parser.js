// Scene2Parser JavaScript implementation

const MAX_OBJECT_NAME_LENGTH = 50;
const ID_LEN = 2;

const NodeType = {
    Object: 'Object',
    Definition: 'Definition',
    InitScript: 'InitScript',
    Header: 'Header',
    Unknown: 'Unknown'
};

const DncType = {
    Unknown: 'Unknown',
    MovableBridge: 'MovableBridge',
    Car: 'Car',
    Script: 'Script',
    InitScript: 'InitScript',
    PhysicalObject: 'PhysicalObject',
    Door: 'Door',
    Tram: 'Tram',
    GasStation: 'GasStation',
    PedestrianSetup: 'PedestrianSetup',
    Enemy: 'Enemy',
    Plane: 'Plane',
    Player: 'Player',
    TrafficSetup: 'TrafficSetup',
    LMAP: 'LMAP',
    Sector: 'Sector',
    Standard: 'Standard',
    Occluder: 'Occluder',
    Model: 'Model',
    Sound: 'Sound',
    Camera: 'Camera',
    CityMusic: 'CityMusic',
    Light: 'Light',
    Clock: 'Clock',
    Wagon: 'Wagon',
    Route: 'Route',
    GhostObject: 'GhostObject',
    Zidle: 'Zidle'
};

// Helper functions for byte operations
const ByteUtils = {
    // Convert 4 bytes to int32 (little endian)
    toInt32: (bytes, offset = 0) => {
        if (!bytes || bytes.length < offset + 4) {
            return 0;
        }
        return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
    },
    
    // Convert 4 bytes to float32 (little endian)
    toFloat32: (bytes, offset = 0) => {
        if (!bytes || bytes.length < offset + 4) {
            return 0;
        }
        try {
            const view = new DataView(new Uint8Array(bytes).buffer);
            return view.getFloat32(offset, true); // true = little endian
        } catch (e) {
            return 0;
        }
    },
    
    // Convert int32 to 4 bytes (little endian)
    fromInt32: (value) => {
        const arr = new Uint8Array(4);
        const view = new DataView(arr.buffer);
        view.setInt32(0, value, true);
        return Array.from(arr);
    },
    
    // Convert float32 to 4 bytes (little endian)
    fromFloat32: (value) => {
        const arr = new Uint8Array(4);
        const view = new DataView(arr.buffer);
        view.setFloat32(0, value, true);
        return Array.from(arr);
    },
    
    // Find index of byte sequence in array
    findIndexOf: (array, candidate) => {
        if (!array || !candidate || array.length === 0 || candidate.length === 0 || candidate.length > array.length) {
            return [];
        }
        
        const indices = [];
        for (let i = 0; i <= array.length - candidate.length; i++) {
            let match = true;
            for (let j = 0; j < candidate.length; j++) {
                if (array[i + j] !== candidate[j]) {
                    match = false;
                    break;
                }
            }
            if (match) {
                indices.push(i);
            }
        }
        return indices;
    },
    
    // Get C string from byte array (null-terminated)
    getCString: (arr, maxLength = MAX_OBJECT_NAME_LENGTH) => {
        let endIndex = arr.indexOf(0);
        if (endIndex === -1) endIndex = Math.min(arr.length, maxLength);
        const slice = arr.slice(0, endIndex);
        // Convert bytes to string, handling ASCII characters
        try {
            return String.fromCharCode(...slice);
        } catch (e) {
            // If array is too large, convert in chunks
            let result = '';
            for (let i = 0; i < slice.length; i++) {
                result += String.fromCharCode(slice[i]);
            }
            return result;
        }
    },
    
    // Cut starting zeros
    cutStartingZeros: (arr) => {
        for (let i = 0; i < arr.length; i++) {
            if (arr[i] !== 0) {
                return arr.slice(i);
            }
        }
        return [];
    }
};

class Scene2Parser {
    constructor() {
        this.scene2Data = {
            sections: [],
            header: {
                magic: [],
                size: [],
                content: null
            }
        };
        this.logs = [];
    }
    
    loadScene(buffer) {
        const tmpBuff = Array.from(new Uint8Array(buffer));
        this.scene2Data = {
            sections: [],
            header: {
                magic: [],
                size: [],
                content: null
            }
        };
        this.logs = [];
        
        let headerParsed = false;
        let sectionEnded = false;
        let i = 0;
        let objectID = 0;
        let loadingHeaderShown = false;
        let currSection = null;
        let positionIterator = 0;
        let antiInfiniteLoopLastValue = 0;
        let headerParsingBeforeText = true;
        let headerParsingText = false;
        let headerParsingAfterText = false;
        
        while (i < tmpBuff.length) {
            if ((antiInfiniteLoopLastValue === i) && (i !== 0)) {
                throw new Error(`File corrupted near 0x${i.toString(16).toUpperCase()} position. Last object loaded: ${currSection?.dncs?.[currSection.dncs.length - 1]?.name || 'unknown'}`);
            }
            antiInfiniteLoopLastValue = i;
            
            if (!headerParsed) {
                // parse header
                if (!loadingHeaderShown) {
                    this.logs.push('Loading header...');
                    loadingHeaderShown = true;
                }
                
                if (headerParsingBeforeText) {
                    i += 16;
                    headerParsingBeforeText = false;
                    headerParsingText = true;
                }
                
                if (headerParsingText) {
                    if (tmpBuff[i] === 0) {
                        headerParsingAfterText = true;
                        i += 68;
                    } else {
                        i++;
                    }
                }
                
                if (headerParsingAfterText) {
                    if (tmpBuff[i] === 0 && tmpBuff[i + 1] === 0x40) {
                        headerParsed = true;
                        
                        this.scene2Data.header.magic = tmpBuff.slice(0, 2);
                        this.scene2Data.header.size = tmpBuff.slice(2, 6);
                        this.scene2Data.header.content = {
                            name: 'Header',
                            dncKind: NodeType.Header,
                            rawData: tmpBuff.slice(6, i),
                            rawDataBackup: tmpBuff.slice(6, i),
                            dncProps: null
                        };
                        
                        this.scene2Data.header.content.dncProps = this.createHeaderProps(this.scene2Data.header.content);
                        
                        currSection = this.parseKnownSection(tmpBuff, i, currSection, positionIterator, 'Loading objects...', 'Objects', NodeType.Object);
                        positionIterator++;
                        i += 6;
                    } else {
                        i++;
                    }
                }
            } else {
                // load dncs
                sectionEnded = false;
                
                // definitions
                if (tmpBuff[i] === 0x21 && tmpBuff[i + 1] === 0xAE) {
                    this.loadDnc(tmpBuff, i, objectID, ID_LEN, currSection);
                    i = currSection.dncs[currSection.dncs.length - 1].nextPosition;
                    objectID++;
                    continue;
                }
                
                // init scripts
                if (tmpBuff[i] === 0x51 && tmpBuff[i + 1] === 0xAE) {
                    this.loadDnc(tmpBuff, i, objectID, ID_LEN, currSection);
                    i = currSection.dncs[currSection.dncs.length - 1].nextPosition;
                    objectID++;
                    if (i >= tmpBuff.length) {
                        break;
                    }
                    continue;
                }
                
                // parse dncs objects
                if (tmpBuff[i] === 0x10 && tmpBuff[i + 1] === 0x40) {
                    this.loadDnc(tmpBuff, i, objectID, ID_LEN, currSection);
                    i = currSection.dncs[currSection.dncs.length - 1].nextPosition;
                    objectID++;
                    continue;
                }
                
                // Check if we've reached section end
                if (currSection && i >= currSection.sectionEnd) {
                    sectionEnded = true;
                    objectID = 0;
                }
                
                if (sectionEnded) {
                    // parse dncs definitions
                    if (tmpBuff[i] === 0x20 && tmpBuff[i + 1] === 0xAE) {
                        sectionEnded = false;
                        currSection = this.parseKnownSection(tmpBuff, i, currSection, positionIterator, 'Loading object definitions...', 'Object definitions', NodeType.Definition);
                        positionIterator++;
                        i += 6;
                        continue;
                    }
                    
                    // init scripts
                    if (tmpBuff[i] === 0x50 && tmpBuff[i + 1] === 0xAE) {
                        sectionEnded = false;
                        currSection = this.parseKnownSection(tmpBuff, i, currSection, positionIterator, 'Loading init scripts...', 'Init scripts', NodeType.InitScript);
                        positionIterator++;
                        i += 6;
                        continue;
                    }
                    
                    if (sectionEnded && i < tmpBuff.length) {
                        sectionEnded = false;
                        currSection = this.parseUnknownSection(tmpBuff, i, objectID, ID_LEN, currSection, positionIterator);
                        positionIterator++;
                        i = currSection.dncs.length > 0 ? currSection.dncs[currSection.dncs.length - 1].nextPosition : i + 6;
                        continue;
                    }
                }
                
                // If we get here and nothing matched, increment to avoid infinite loop
                if (i < tmpBuff.length) {
                    i++;
                }
            }
        }
        
        return this.scene2Data;
    }
    
    loadDnc(inputBuff, i, objectID, idLen, currSection) {
        // Check bounds before reading length
        if (i + idLen + 4 > inputBuff.length) {
            return;
        }
        
        const lenCurr = ByteUtils.toInt32(inputBuff.slice(i + idLen, i + idLen + 4)) - idLen;
        
        // Check if we have enough data for the full DNC
        if (i + idLen + lenCurr > inputBuff.length) {
            return;
        }
        
        const currDnc = {
            dncType: DncType.Unknown,
            objectIDArr: inputBuff.slice(i, i + idLen),
            rawData: inputBuff.slice(i + idLen, i + idLen + lenCurr),
            rawDataBackup: inputBuff.slice(i + idLen, i + idLen + lenCurr),
            dncKind: currSection.sectionType,
            ID: objectID,
            name: '',
            dncProps: null,
            nextPosition: i + idLen + lenCurr
        };
        
        currDnc.dncType = this.getObjectDefinitionType(currDnc);
        if (currDnc.dncType === DncType.Unknown) {
            currDnc.dncType = this.getObjectType(currDnc);
        }
        
        currDnc.name = this.getNameOfDnc(currDnc);
        this.populateProps(currDnc);
        
        currSection.dncs.push(currDnc);
    }
    
    populateProps(currDnc) {
        switch (currDnc.dncType) {
            case DncType.Enemy:
                currDnc.dncProps = this.createEnemyProps(currDnc);
                break;
            case DncType.Standard:
                currDnc.dncProps = this.createStandardProps(currDnc);
                break;
            case DncType.Model:
                currDnc.dncProps = this.createModelProps(currDnc);
                break;
            case DncType.Header:
                currDnc.dncProps = this.createHeaderProps(currDnc);
                break;
            case DncType.Light:
                currDnc.dncProps = this.createLightProps(currDnc);
                break;
            case DncType.Sound:
                currDnc.dncProps = this.createSoundProps(currDnc);
                break;
            case DncType.Occluder:
                currDnc.dncProps = this.createOccluderProps(currDnc);
                break;
            case DncType.Camera:
                currDnc.dncProps = this.createCameraProps(currDnc);
                break;
            case DncType.Sector:
                currDnc.dncProps = this.createSectorProps(currDnc);
                break;
            case DncType.Script:
                currDnc.dncProps = this.createScriptProps(currDnc);
                break;
            case DncType.InitScript:
                currDnc.dncProps = this.createInitScriptProps(currDnc);
                break;
        }
    }
    
    parseKnownSection(tmpBuff, i, currSection, positionIterator, logMsg, sectionName, nodeType) {
        this.logs.push(logMsg);
        
        // Check bounds before reading section length
        if (i + 6 > tmpBuff.length) {
            return null;
        }
        
        const sectionLen = ByteUtils.toInt32(tmpBuff.slice(i + 2, i + 6));
        
        currSection = {
            position: positionIterator,
            sectionName: sectionName,
            sectionType: nodeType,
            sectionStart: i,
            sectionIdArr: tmpBuff.slice(i, i + 2),
            sectionLength: sectionLen,
            sectionEnd: i + sectionLen,
            dncs: []
        };
        
        this.scene2Data.sections.push(currSection);
        return currSection;
    }
    
    parseUnknownSection(tmpBuff, i, objectID, idLen, currSection, positionIterator) {
        // Check bounds before reading section length
        if (i + 6 > tmpBuff.length) {
            return null;
        }
        
        const sectionLen = ByteUtils.toInt32(tmpBuff.slice(i + 2, i + 6));
        
        currSection = {
            position: positionIterator,
            sectionName: `Unknown ${positionIterator}`,
            sectionType: NodeType.Unknown,
            sectionStart: i,
            sectionIdArr: tmpBuff.slice(i, i + 2),
            sectionLength: sectionLen,
            sectionEnd: i + sectionLen,
            dncs: []
        };
        
        this.scene2Data.sections.push(currSection);
        
        let tmpPos = 6;
        let localI = i + 6; // move to first dnc
        let localObjectID = 0;
        while (tmpPos < sectionLen && localI < tmpBuff.length) {
            // Check bounds before reading DNC length
            if (localI + 6 > tmpBuff.length) break;
            
            const dncLen = ByteUtils.toInt32(tmpBuff.slice(localI + 2, localI + 6));
            
            // Check if we have enough data for the full DNC
            if (localI + dncLen > tmpBuff.length) break;
            
            const currDnc = {
                dncType: DncType.Unknown,
                name: `Unknown ${localObjectID}`,
                ID: localObjectID,
                objectIDArr: tmpBuff.slice(localI, localI + idLen),
                rawData: tmpBuff.slice(localI + idLen, localI + dncLen),
                dncKind: NodeType.Unknown,
                nextPosition: localI + dncLen
            };
            
            currDnc.rawDataBackup = [...currDnc.rawData];
            
            currSection.dncs.push(currDnc);
            
            tmpPos += dncLen;
            localObjectID++;
            localI += dncLen;
        }
        
        return currSection;
    }
    
    getNameOfDnc(dnc) {
        if (!dnc.rawData || dnc.rawData.length === 0) {
            return `Unknown ${dnc.ID}`;
        }
        
        switch (dnc.dncType) {
            case DncType.Unknown:
                if (dnc.rawData.length < 10) return `Unknown ${dnc.ID}`;
                return ByteUtils.getCString(dnc.rawData.slice(10, 10 + MAX_OBJECT_NAME_LENGTH));
                
            case DncType.InitScript:
                if (dnc.rawData.length < 6) return `Unknown ${dnc.ID}`;
                const len = dnc.rawData[5];
                if (dnc.rawData.length < 0x9 + len) {
                    return `Unknown ${dnc.ID}`;
                }
                const initNameBytes = dnc.rawData.slice(0x9, 0x9 + len);
                try {
                    return String.fromCharCode(...initNameBytes);
                } catch (e) {
                    let result = '';
                    for (let i = 0; i < initNameBytes.length; i++) {
                        result += String.fromCharCode(initNameBytes[i]);
                    }
                    return result;
                }
                
            case DncType.MovableBridge:
            case DncType.Car:
            case DncType.Script:
            case DncType.PhysicalObject:
            case DncType.Door:
            case DncType.Tram:
            case DncType.GasStation:
            case DncType.PedestrianSetup:
            case DncType.Enemy:
            case DncType.Plane:
            case DncType.Player:
            case DncType.TrafficSetup:
            case DncType.LMAP:
            case DncType.Sector:
            case DncType.Wagon:
            case DncType.Route:
            case DncType.Clock:
            case DncType.GhostObject:
            case DncType.Zidle:
                if (dnc.rawData.length < 10) return `Unknown ${dnc.ID}`;
                return ByteUtils.getCString(dnc.rawData.slice(10, 10 + MAX_OBJECT_NAME_LENGTH));
                
            case DncType.Standard:
            case DncType.Occluder:
            case DncType.Model:
            case DncType.Sound:
            case DncType.Camera:
            case DncType.CityMusic:
            case DncType.Light:
                if (dnc.rawData.length < 20) return `Unknown ${dnc.ID}`;
                return ByteUtils.getCString(dnc.rawData.slice(20, 20 + MAX_OBJECT_NAME_LENGTH));
                
            default:
                return `Unknown ${dnc.ID}`;
        }
    }
    
    getObjectType(dnc) {
        if (!dnc.rawData || dnc.rawData.length < 5) {
            return DncType.Unknown;
        }
        
        if (dnc.rawData[4] === 0x10) {
            if (ByteUtils.findIndexOf(dnc.rawData, [0x4C, 0x4D, 0x41, 0x50]).length > 0) {
                return DncType.LMAP;
            } else {
                if (ByteUtils.findIndexOf(dnc.rawData, [0x01, 0xB4, 0xF2]).length > 0) {
                    return DncType.Sector;
                } else {
                    return DncType.Unknown;
                }
            }
        } else {
            const firstN = dnc.rawData.slice(0, Math.min(20 + MAX_OBJECT_NAME_LENGTH, dnc.rawData.length));
            if (ByteUtils.findIndexOf(firstN, [0x11, 0x40, 0x0A, 0x00, 0x00, 0x00, 0x0C]).length > 0) {
                return DncType.Occluder;
            } else {
                if (ByteUtils.findIndexOf(firstN, [0x11, 0x40, 0x0A, 0x00, 0x00, 0x00, 0x09]).length > 0) {
                    return DncType.Model;
                } else {
                    if (ByteUtils.findIndexOf(firstN, [0x11, 0x40, 0x0A, 0x00, 0x00, 0x00, 0x04]).length > 0) {
                        return DncType.Sound;
                    } else {
                        if (ByteUtils.findIndexOf(firstN, [0x11, 0x40, 0x0A, 0x00, 0x00, 0x00, 0x03]).length > 0) {
                            return DncType.Camera;
                        } else {
                            if (ByteUtils.findIndexOf(firstN, [0x11, 0x40, 0x0A, 0x00, 0x00, 0x00, 0x0E]).length > 0) {
                                return DncType.CityMusic;
                            } else {
                                if (ByteUtils.findIndexOf(firstN, [0x11, 0x40, 0x0A, 0x00, 0x00, 0x00, 0x02]).length > 0) {
                                    return DncType.Light;
                                }
                            }
                        }
                    }
                }
            }
            return DncType.Standard;
        }
    }
    
    getObjectDefinitionType(dnc) {
        if (!dnc.rawData || dnc.rawData.length < 5) {
            return DncType.Unknown;
        }
        
        if (ByteUtils.findIndexOf(dnc.rawData.slice(4, 5), [0x01]).length > 0) {
            return DncType.InitScript;
        }
        
        const firstN = dnc.rawData.slice(0, Math.min(20 + MAX_OBJECT_NAME_LENGTH, dnc.rawData.length));
        const patterns = [
            [[0x22, 0xAE, 0x0A, 0x00, 0x00, 0x00, 0x04], DncType.Car],
            [[0x22, 0xAE, 0x0A, 0x00, 0x00, 0x00, 0x14], DncType.MovableBridge],
            [[0x22, 0xAE, 0x0A, 0x00, 0x00, 0x00, 0x05], DncType.Script],
            [[0x22, 0xAE, 0x0A, 0x00, 0x00, 0x00, 0x23], DncType.PhysicalObject],
            [[0x22, 0xAE, 0x0A, 0x00, 0x00, 0x00, 0x06], DncType.Door],
            [[0x22, 0xAE, 0x0A, 0x00, 0x00, 0x00, 0x08], DncType.Tram],
            [[0x22, 0xAE, 0x0A, 0x00, 0x00, 0x00, 0x19], DncType.GasStation],
            [[0x22, 0xAE, 0x0A, 0x00, 0x00, 0x00, 0x12], DncType.PedestrianSetup],
            [[0x22, 0xAE, 0x0A, 0x00, 0x00, 0x00, 0x1B], DncType.Enemy],
            [[0x22, 0xAE, 0x0A, 0x00, 0x00, 0x00, 0x16], DncType.Plane],
            [[0x22, 0xAE, 0x0A, 0x00, 0x00, 0x00, 0x02], DncType.Player],
            [[0x22, 0xAE, 0x0A, 0x00, 0x00, 0x00, 0x0C], DncType.TrafficSetup],
            [[0x22, 0xAE, 0x0A, 0x00, 0x00, 0x00, 0x22], DncType.Clock],
            [[0x22, 0xAE, 0x0A, 0x00, 0x00, 0x00, 0x1E], DncType.Wagon],
            [[0x22, 0xAE, 0x0A, 0x00, 0x00, 0x00, 0x18], DncType.Route],
            [[0x22, 0xAE, 0x0A, 0x00, 0x00, 0x00, 0x01], DncType.GhostObject],
            [[0x22, 0xAE, 0x0A, 0x00, 0x00, 0x00, 0x09], DncType.Zidle]
        ];
        
        for (const [pattern, type] of patterns) {
            if (ByteUtils.findIndexOf(firstN, pattern).length > 0) {
                return type;
            }
        }
        
        return DncType.Unknown;
    }
    
    createHeaderProps(dnc) {
        const dataBegin = 0;
        if (dnc.rawData.length < dataBegin + 3) {
            return {
                dataBegin: dataBegin,
                headerLength: 0,
                text: '',
                viewDistance: 0,
                cameraDistance: 0,
                nearClipping: 0,
                farClipping: 0
            };
        }
        
        const headerLength = dnc.rawData[dataBegin + 2];
        const text = this.getStringFromDnc(dnc, dataBegin, 10);
        
        const textLength = text.length;
        const minRequiredLength = dataBegin + textLength + 78;
        
        if (dnc.rawData.length < minRequiredLength) {
            return {
                dataBegin: dataBegin,
                headerLength: headerLength,
                text: text,
                viewDistance: 0,
                cameraDistance: 0,
                nearClipping: 0,
                farClipping: 0
            };
        }
        
        const viewDistance = ByteUtils.toFloat32(dnc.rawData.slice(dataBegin + textLength + 60, dataBegin + textLength + 64));
        const cameraDistance = ByteUtils.toFloat32(dnc.rawData.slice(dataBegin + textLength + 50, dataBegin + textLength + 54));
        const nearClipping = ByteUtils.toFloat32(dnc.rawData.slice(dataBegin + textLength + 70, dataBegin + textLength + 74));
        const farClipping = ByteUtils.toFloat32(dnc.rawData.slice(dataBegin + textLength + 74, dataBegin + textLength + 78));
        
        return {
            dataBegin: dataBegin,
            headerLength: headerLength,
            text: text,
            viewDistance: viewDistance,
            cameraDistance: cameraDistance,
            nearClipping: nearClipping,
            farClipping: farClipping
        };
    }
    
    createStandardProps(dnc) {
        const dataBegin = 23 + dnc.name.length;
        
        const positionX = ByteUtils.toFloat32(dnc.rawData.slice(dataBegin + 4, dataBegin + 8));
        const positionY = ByteUtils.toFloat32(dnc.rawData.slice(dataBegin + 8, dataBegin + 12));
        const positionZ = ByteUtils.toFloat32(dnc.rawData.slice(dataBegin + 12, dataBegin + 16));
        
        const rotationX = ByteUtils.toFloat32(dnc.rawData.slice(dataBegin + 26, dataBegin + 30));
        const rotationY = ByteUtils.toFloat32(dnc.rawData.slice(dataBegin + 30, dataBegin + 34));
        const rotationZ = ByteUtils.toFloat32(dnc.rawData.slice(dataBegin + 34, dataBegin + 38));
        
        const scalingX = ByteUtils.toFloat32(dnc.rawData.slice(dataBegin + 44, dataBegin + 48));
        const scalingY = ByteUtils.toFloat32(dnc.rawData.slice(dataBegin + 48, dataBegin + 52));
        const scalingZ = ByteUtils.toFloat32(dnc.rawData.slice(dataBegin + 52, dataBegin + 56));
        
        return {
            dataBegin: dataBegin,
            positionX: positionX,
            positionY: positionY,
            positionZ: positionZ,
            rotationX: rotationX,
            rotationY: rotationY,
            rotationZ: rotationZ,
            scalingX: scalingX,
            scalingY: scalingY,
            scalingZ: scalingZ
        };
    }
    
    createModelProps(dnc) {
        const standardProps = this.createStandardProps(dnc);
        const dataBegin = standardProps.dataBegin;
        
        // Check for sector
        const sectorCheck = ByteUtils.findIndexOf(dnc.rawData.slice(dataBegin + 76), [0, 0, 0, 0x10, 0]);
        const haveSector = sectorCheck.length > 0;
        
        let model = '';
        let sector = '';
        
        if (haveSector) {
            sector = this.getStringFromDnc(dnc, dataBegin, 86);
            model = this.getStringFromDnc(dnc, dataBegin, sector.length + 93);
        } else {
            model = this.getStringFromDnc(dnc, dataBegin, 80);
        }
        
        return {
            ...standardProps,
            model: model,
            sector: sector,
            haveSector: haveSector
        };
    }
    
    createEnemyProps(dnc) {
        const dataBeginIndices = ByteUtils.findIndexOf(dnc.rawData, [0x24, 0xAE]);
        const dataBegin = dataBeginIndices.length > 0 ? dataBeginIndices[0] + 2 : 0;
        
        if (dnc.rawData.length < dataBegin + 77) {
            return {
                dataBegin: dataBegin,
                agressivity: 0, behavior1: 0, behavior2: 0, driving: 0,
                hearing: 0, intelligence: 0, mass: 0, reactions: 0,
                shooting: 0, sight: 0, speed: 0, strength: 0, voice: 0,
                enemyEnergy: { energy: 0, leftHand: 0, rightHand: 0, leftLeg: 0, rightLeg: 0 },
                script: ''
            };
        }
        
        const agressivity = ByteUtils.toFloat32(dnc.rawData.slice(dataBegin + 45, dataBegin + 49));
        const behavior1 = dnc.rawData[dataBegin + 5] || 0;
        const behavior2 = ByteUtils.toFloat32(dnc.rawData.slice(dataBegin + 37, dataBegin + 41));
        const driving = ByteUtils.toFloat32(dnc.rawData.slice(dataBegin + 65, dataBegin + 69));
        
        const enemyEnergy = {
            energy: ByteUtils.toFloat32(dnc.rawData.slice(dataBegin + 17, dataBegin + 21)),
            leftHand: ByteUtils.toFloat32(dnc.rawData.slice(dataBegin + 21, dataBegin + 25)),
            rightHand: ByteUtils.toFloat32(dnc.rawData.slice(dataBegin + 25, dataBegin + 29)),
            leftLeg: ByteUtils.toFloat32(dnc.rawData.slice(dataBegin + 29, dataBegin + 33)),
            rightLeg: ByteUtils.toFloat32(dnc.rawData.slice(dataBegin + 33, dataBegin + 37))
        };
        
        const hearing = ByteUtils.toFloat32(dnc.rawData.slice(dataBegin + 61, dataBegin + 65));
        const intelligence = ByteUtils.toFloat32(dnc.rawData.slice(dataBegin + 49, dataBegin + 53));
        const mass = ByteUtils.toFloat32(dnc.rawData.slice(dataBegin + 69, dataBegin + 73));
        const reactions = ByteUtils.toFloat32(dnc.rawData.slice(dataBegin + 73, dataBegin + 77));
        const shooting = ByteUtils.toFloat32(dnc.rawData.slice(dataBegin + 53, dataBegin + 57));
        const sight = ByteUtils.toFloat32(dnc.rawData.slice(dataBegin + 57, dataBegin + 61));
        const speed = ByteUtils.toFloat32(dnc.rawData.slice(dataBegin + 41, dataBegin + 45));
        const strength = ByteUtils.toFloat32(dnc.rawData.slice(dataBegin + 13, dataBegin + 17));
        const voice = dnc.rawData[dataBegin + 9] || 0;
        
        // Extract script if available
        const script = this.getScriptFromDnc(dnc);
        
        return {
            dataBegin: dataBegin,
            agressivity: agressivity,
            behavior1: behavior1,
            behavior2: behavior2,
            driving: driving,
            hearing: hearing,
            intelligence: intelligence,
            mass: mass,
            reactions: reactions,
            shooting: shooting,
            sight: sight,
            speed: speed,
            strength: strength,
            voice: voice,
            enemyEnergy: enemyEnergy,
            script: script
        };
    }
    
    getStringFromDnc(dnc, dataBegin, offset) {
        const startIndex = dataBegin + offset;
        if (startIndex >= dnc.rawData.length) return '';
        
        const endIndex = dnc.rawData.indexOf(0, startIndex);
        if (endIndex === -1) {
            // No null terminator found, return remaining data
            const slice = dnc.rawData.slice(startIndex);
            try {
                return String.fromCharCode(...slice.filter(b => b >= 32 && b < 127));
            } catch (e) {
                let result = '';
                for (let i = 0; i < slice.length && i < 1000; i++) {
                    if (slice[i] >= 32 && slice[i] < 127) {
                        result += String.fromCharCode(slice[i]);
                    }
                }
                return result;
            }
        }
        
        const slice = dnc.rawData.slice(startIndex, endIndex);
        try {
            return String.fromCharCode(...slice);
        } catch (e) {
            let result = '';
            for (let i = 0; i < slice.length; i++) {
                result += String.fromCharCode(slice[i]);
            }
            return result;
        }
    }
    
    createLightProps(dnc) {
        const standardProps = this.createStandardProps(dnc);
        const dataBegin = standardProps.dataBegin;
        
        // Find Light node (0x4040)
        const lightStart = ByteUtils.findIndexOf(dnc.rawData, [0x40, 0x40]);
        if (lightStart.length === 0) {
            return standardProps;
        }
        
        let offset = lightStart[0];
        
        // Skip node type and size (6 bytes)
        if (offset + 6 > dnc.rawData.length) {
            return standardProps;
        }
        offset += 6;
        
        // Type (0x4041) - Uint32
        const typeOffset = ByteUtils.findIndexOf(dnc.rawData.slice(offset), [0x41, 0x40]);
        let type = 0;
        if (typeOffset.length > 0 && offset + typeOffset[0] + 10 <= dnc.rawData.length) {
            const typePos = offset + typeOffset[0] + 6;
            type = ByteUtils.toInt32(dnc.rawData.slice(typePos, typePos + 4));
        }
        
        // Color (0x0026) - Float3
        const colorOffset = ByteUtils.findIndexOf(dnc.rawData.slice(offset), [0x26, 0x00]);
        let color = { r: 0, g: 0, b: 0 };
        if (colorOffset.length > 0 && offset + colorOffset[0] + 18 <= dnc.rawData.length) {
            const colorPos = offset + colorOffset[0] + 6;
            color = {
                r: ByteUtils.toFloat32(dnc.rawData.slice(colorPos, colorPos + 4)),
                g: ByteUtils.toFloat32(dnc.rawData.slice(colorPos + 4, colorPos + 8)),
                b: ByteUtils.toFloat32(dnc.rawData.slice(colorPos + 8, colorPos + 12))
            };
        }
        
        // Power (0x4042) - Float
        const powerOffset = ByteUtils.findIndexOf(dnc.rawData.slice(offset), [0x42, 0x40]);
        let power = 0;
        if (powerOffset.length > 0 && offset + powerOffset[0] + 10 <= dnc.rawData.length) {
            const powerPos = offset + powerOffset[0] + 6;
            power = ByteUtils.toFloat32(dnc.rawData.slice(powerPos, powerPos + 4));
        }
        
        // Cone (0x4043) - Float2 (InnerAngle, OuterAngle)
        const coneOffset = ByteUtils.findIndexOf(dnc.rawData.slice(offset), [0x43, 0x40]);
        let cone = { innerAngle: 0, outerAngle: 0 };
        if (coneOffset.length > 0 && offset + coneOffset[0] + 14 <= dnc.rawData.length) {
            const conePos = offset + coneOffset[0] + 6;
            cone = {
                innerAngle: ByteUtils.toFloat32(dnc.rawData.slice(conePos, conePos + 4)),
                outerAngle: ByteUtils.toFloat32(dnc.rawData.slice(conePos + 4, conePos + 8))
            };
        }
        
        // Radius (0x4044) - Float2 (InnerRadius, OuterRadius)
        const radiusOffset = ByteUtils.findIndexOf(dnc.rawData.slice(offset), [0x44, 0x40]);
        let radius = { innerRadius: 0, outerRadius: 0 };
        if (radiusOffset.length > 0 && offset + radiusOffset[0] + 14 <= dnc.rawData.length) {
            const radiusPos = offset + radiusOffset[0] + 6;
            radius = {
                innerRadius: ByteUtils.toFloat32(dnc.rawData.slice(radiusPos, radiusPos + 4)),
                outerRadius: ByteUtils.toFloat32(dnc.rawData.slice(radiusPos + 4, radiusPos + 8))
            };
        }
        
        // Flags (0x4045) - Hex32
        const flagsOffset = ByteUtils.findIndexOf(dnc.rawData.slice(offset), [0x45, 0x40]);
        let flags = 0;
        if (flagsOffset.length > 0 && offset + flagsOffset[0] + 10 <= dnc.rawData.length) {
            const flagsPos = offset + flagsOffset[0] + 6;
            flags = ByteUtils.toInt32(dnc.rawData.slice(flagsPos, flagsPos + 4));
        }
        
        // Sector (0x4046) - String
        const sectorOffset = ByteUtils.findIndexOf(dnc.rawData.slice(offset), [0x46, 0x40]);
        let sector = '';
        if (sectorOffset.length > 0 && offset + sectorOffset[0] + 6 < dnc.rawData.length) {
            const sectorPos = offset + sectorOffset[0] + 6;
            sector = this.getStringFromDnc(dnc, 0, sectorPos);
        }
        
        const lightTypes = { 1: 'Point', 2: 'Spot', 3: 'Directional', 4: 'Ambient', 5: 'Fog' };
        
        return {
            ...standardProps,
            lightType: lightTypes[type] || `Unknown(${type})`,
            color: color,
            power: power,
            cone: cone,
            radius: radius,
            flags: '0x' + flags.toString(16).toUpperCase(),
            sector: sector
        };
    }
    
    createSoundProps(dnc) {
        const standardProps = this.createStandardProps(dnc);
        const dataBegin = standardProps.dataBegin;
        
        // Find Sound node (0x4060)
        const soundStart = ByteUtils.findIndexOf(dnc.rawData, [0x60, 0x40]);
        if (soundStart.length === 0) {
            return standardProps;
        }
        
        let offset = soundStart[0];
        if (offset + 6 > dnc.rawData.length) {
            return standardProps;
        }
        offset += 6; // Skip node type and size
        
        // Type (0x4061) - Uint32
        const typeOffset = ByteUtils.findIndexOf(dnc.rawData.slice(offset), [0x61, 0x40]);
        let type = 0;
        if (typeOffset.length > 0 && offset + typeOffset[0] + 10 <= dnc.rawData.length) {
            const typePos = offset + typeOffset[0] + 6;
            type = ByteUtils.toInt32(dnc.rawData.slice(typePos, typePos + 4));
        }
        
        // Volume (0x4062) - Float
        const volumeOffset = ByteUtils.findIndexOf(dnc.rawData.slice(offset), [0x62, 0x40]);
        let volume = 0;
        if (volumeOffset.length > 0 && offset + volumeOffset[0] + 10 <= dnc.rawData.length) {
            const volumePos = offset + volumeOffset[0] + 6;
            volume = ByteUtils.toFloat32(dnc.rawData.slice(volumePos, volumePos + 4));
        }
        
        // Radius (0x4068) - Float4 (InnerRadius, OuterRadius, InnerFalloff, OuterFalloff)
        const radiusOffset = ByteUtils.findIndexOf(dnc.rawData.slice(offset), [0x68, 0x40]);
        let radius = { innerRadius: 0, outerRadius: 0, innerFalloff: 0, outerFalloff: 0 };
        if (radiusOffset.length > 0 && offset + radiusOffset[0] + 22 <= dnc.rawData.length) {
            const radiusPos = offset + radiusOffset[0] + 6;
            radius = {
                innerRadius: ByteUtils.toFloat32(dnc.rawData.slice(radiusPos, radiusPos + 4)),
                outerRadius: ByteUtils.toFloat32(dnc.rawData.slice(radiusPos + 4, radiusPos + 8)),
                innerFalloff: ByteUtils.toFloat32(dnc.rawData.slice(radiusPos + 8, radiusPos + 12)),
                outerFalloff: ByteUtils.toFloat32(dnc.rawData.slice(radiusPos + 12, radiusPos + 16))
            };
        }
        
        // Pitch (0xb800) - Float
        const pitchOffset = ByteUtils.findIndexOf(dnc.rawData.slice(offset), [0x00, 0xb8]);
        let pitch = 0;
        if (pitchOffset.length > 0 && offset + pitchOffset[0] + 10 <= dnc.rawData.length) {
            const pitchPos = offset + pitchOffset[0] + 6;
            pitch = ByteUtils.toFloat32(dnc.rawData.slice(pitchPos, pitchPos + 4));
        }
        
        // Sector (0xb200) - String
        const sectorOffset = ByteUtils.findIndexOf(dnc.rawData.slice(offset), [0x00, 0xb2]);
        let sector = '';
        if (sectorOffset.length > 0 && offset + sectorOffset[0] + 6 < dnc.rawData.length) {
            const sectorPos = offset + sectorOffset[0] + 6;
            sector = this.getStringFromDnc(dnc, 0, sectorPos);
        }
        
        // Check for Loop (0x4066) - no data
        const hasLoop = ByteUtils.findIndexOf(dnc.rawData.slice(offset), [0x66, 0x40]).length > 0;
        
        const soundTypes = { 1: 'Point', 3: 'Ambient' };
        
        return {
            ...standardProps,
            soundType: soundTypes[type] || `Unknown(${type})`,
            volume: volume,
            radius: radius,
            pitch: pitch,
            sector: sector,
            loop: hasLoop
        };
    }
    
    createOccluderProps(dnc) {
        const standardProps = this.createStandardProps(dnc);
        const dataBegin = standardProps.dataBegin;
        
        // Find Occluder node (0x4083)
        const occluderStart = ByteUtils.findIndexOf(dnc.rawData, [0x83, 0x40]);
        if (occluderStart.length === 0) {
            return standardProps;
        }
        
        let offset = occluderStart[0];
        if (offset + 10 > dnc.rawData.length) {
            return standardProps;
        }
        offset += 6; // Skip node type and size
        
        // VerticesCount - Uint32
        if (offset + 4 > dnc.rawData.length) {
            return standardProps;
        }
        const verticesCount = ByteUtils.toInt32(dnc.rawData.slice(offset, offset + 4));
        offset += 4;
        
        // Vertices - Float3 array
        const vertices = [];
        for (let i = 0; i < verticesCount; i++) {
            if (offset + 12 > dnc.rawData.length) break;
            vertices.push({
                x: ByteUtils.toFloat32(dnc.rawData.slice(offset, offset + 4)),
                y: ByteUtils.toFloat32(dnc.rawData.slice(offset + 4, offset + 8)),
                z: ByteUtils.toFloat32(dnc.rawData.slice(offset + 8, offset + 12))
            });
            offset += 12;
        }
        
        // TrianglesCount - Uint32
        if (offset + 4 > dnc.rawData.length) {
            return { ...standardProps, verticesCount: verticesCount, vertices: vertices, trianglesCount: 0, triangles: [] };
        }
        const trianglesCount = ByteUtils.toInt32(dnc.rawData.slice(offset, offset + 4));
        offset += 4;
        
        // TriangleIndices - Uint16_3 array
        const triangles = [];
        for (let i = 0; i < trianglesCount; i++) {
            if (offset + 6 > dnc.rawData.length) break;
            triangles.push({
                i0: dnc.rawData[offset] | (dnc.rawData[offset + 1] << 8),
                i1: dnc.rawData[offset + 2] | (dnc.rawData[offset + 3] << 8),
                i2: dnc.rawData[offset + 4] | (dnc.rawData[offset + 5] << 8)
            });
            offset += 6;
        }
        
        return {
            ...standardProps,
            verticesCount: verticesCount,
            vertices: vertices,
            trianglesCount: trianglesCount,
            triangles: triangles
        };
    }
    
    createCameraProps(dnc) {
        const standardProps = this.createStandardProps(dnc);
        
        // Camera typically has CameraFov (0x3010) somewhere
        const fovOffset = ByteUtils.findIndexOf(dnc.rawData, [0x10, 0x30]);
        let fov = 0;
        if (fovOffset.length > 0 && fovOffset[0] + 10 <= dnc.rawData.length) {
            const fovPos = fovOffset[0] + 6;
            fov = ByteUtils.toFloat32(dnc.rawData.slice(fovPos, fovPos + 4));
        }
        
        return {
            ...standardProps,
            fov: fov
        };
    }
    
    createSectorProps(dnc) {
        const standardProps = this.createStandardProps(dnc);
        const dataBegin = standardProps.dataBegin;
        
        // Find Sector node (0xb401)
        const sectorStart = ByteUtils.findIndexOf(dnc.rawData, [0x01, 0xb4]);
        if (sectorStart.length === 0) {
            return standardProps;
        }
        
        let offset = sectorStart[0];
        offset += 6; // Skip node type and size
        
        // Sector has many unknown fields according to definitions.txt
        // We'll extract what we can find
        const props = {
            ...standardProps,
            sectorData: {}
        };
        
        // Try to extract common fields if they exist
        // This is a simplified version - full parsing would require more analysis
        if (offset + 4 <= dnc.rawData.length) {
            props.sectorData.unknown0 = ByteUtils.toFloat32(dnc.rawData.slice(offset, offset + 4));
        }
        
        return props;
    }
    
    getScriptFromDnc(dnc, useBackup = false) {
        if (!dnc || !dnc.rawData || dnc.rawData.length === 0) {
            return '';
        }
        
        let offset = 0;
        
        switch (dnc.dncType) {
            case DncType.Script:
                offset = 41;
                break;
            case DncType.InitScript:
                offset = 13;
                break;
            case DncType.Enemy:
                offset = 110;
                break;
            default:
                return '';
        }
        
        const rawData = useBackup ? dnc.rawDataBackup : dnc.rawData;
        const startIndex = (dnc.name ? dnc.name.length : 0) + offset;
        
        // Check bounds
        if (startIndex >= rawData.length) {
            return '';
        }
        
        // Script text starts after name + offset and continues to the end
        // Convert bytes to UTF-8 string
        const scriptBytes = rawData.slice(startIndex);
        
        try {
            // Try to decode as UTF-8
            const decoder = new TextDecoder('utf-8');
            return decoder.decode(new Uint8Array(scriptBytes));
        } catch (e) {
            // Fallback to ASCII if UTF-8 fails
            let result = '';
            for (let i = 0; i < scriptBytes.length; i++) {
                const byte = scriptBytes[i];
                if (byte === 0) break; // Stop at null terminator if present
                if (byte >= 32 && byte < 127) {
                    result += String.fromCharCode(byte);
                } else if (byte >= 128) {
                    // Try to handle UTF-8 continuation bytes
                    result += String.fromCharCode(byte);
                }
            }
            return result;
        }
    }
    
    createScriptProps(dnc) {
        const standardProps = this.createStandardProps(dnc);
        const script = this.getScriptFromDnc(dnc);
        
        return {
            ...standardProps,
            script: script
        };
    }
    
    createInitScriptProps(dnc) {
        // InitScript has different structure - name is at offset 9
        const script = this.getScriptFromDnc(dnc);
        
        return {
            script: script
        };
    }
    
    // Methods for writing changes back to rawData
    writeFloat32ToRawData(rawData, offset, value) {
        if (offset + 4 > rawData.length) return false;
        const bytes = ByteUtils.fromFloat32(value);
        for (let i = 0; i < 4; i++) {
            rawData[offset + i] = bytes[i];
        }
        return true;
    }
    
    writeInt32ToRawData(rawData, offset, value) {
        if (offset + 4 > rawData.length) return false;
        const bytes = ByteUtils.fromInt32(value);
        for (let i = 0; i < 4; i++) {
            rawData[offset + i] = bytes[i];
        }
        return true;
    }
    
    updateStandardProps(dnc, props) {
        if (!dnc.dncProps || !dnc.dncProps.dataBegin) {
            // Recalculate dataBegin if needed
            dnc.dncProps = this.createStandardProps(dnc);
        }
        
        const dataBegin = dnc.dncProps.dataBegin;
        
        if (props.positionX !== undefined) {
            this.writeFloat32ToRawData(dnc.rawData, dataBegin + 4, props.positionX);
        }
        if (props.positionY !== undefined) {
            this.writeFloat32ToRawData(dnc.rawData, dataBegin + 8, props.positionY);
        }
        if (props.positionZ !== undefined) {
            this.writeFloat32ToRawData(dnc.rawData, dataBegin + 12, props.positionZ);
        }
        if (props.rotationX !== undefined) {
            this.writeFloat32ToRawData(dnc.rawData, dataBegin + 26, props.rotationX);
        }
        if (props.rotationY !== undefined) {
            this.writeFloat32ToRawData(dnc.rawData, dataBegin + 30, props.rotationY);
        }
        if (props.rotationZ !== undefined) {
            this.writeFloat32ToRawData(dnc.rawData, dataBegin + 34, props.rotationZ);
        }
        if (props.scalingX !== undefined) {
            this.writeFloat32ToRawData(dnc.rawData, dataBegin + 44, props.scalingX);
        }
        if (props.scalingY !== undefined) {
            this.writeFloat32ToRawData(dnc.rawData, dataBegin + 48, props.scalingY);
        }
        if (props.scalingZ !== undefined) {
            this.writeFloat32ToRawData(dnc.rawData, dataBegin + 52, props.scalingZ);
        }
        
        // Update dncProps to reflect changes
        this.populateProps(dnc);
    }
    
    updateEnemyProps(dnc, props) {
        if (!dnc.dncProps || !dnc.dncProps.dataBegin) {
            dnc.dncProps = this.createEnemyProps(dnc);
        }
        
        const dataBegin = dnc.dncProps.dataBegin;
        
        const propMap = {
            'strength': 13,
            'energy': 17,
            'leftHand': 21,
            'rightHand': 25,
            'leftLeg': 29,
            'rightLeg': 33,
            'behavior2': 37,
            'speed': 41,
            'agressivity': 45,
            'intelligence': 49,
            'shooting': 53,
            'sight': 57,
            'hearing': 61,
            'driving': 65,
            'mass': 69,
            'reactions': 73
        };
        
        for (const [propName, offset] of Object.entries(propMap)) {
            if (props[propName] !== undefined) {
                this.writeFloat32ToRawData(dnc.rawData, dataBegin + offset, props[propName]);
            }
        }
        
        if (props.behavior1 !== undefined) {
            dnc.rawData[dataBegin + 5] = props.behavior1;
        }
        if (props.voice !== undefined) {
            dnc.rawData[dataBegin + 9] = props.voice;
        }
        
        // Update dncProps to reflect changes
        this.populateProps(dnc);
    }
    
    updateHeaderProps(dnc, props) {
        if (!dnc.dncProps || dnc.dncProps.dataBegin === undefined) {
            dnc.dncProps = this.createHeaderProps(dnc);
        }
        
        const dataBegin = dnc.dncProps.dataBegin;
        const textLength = dnc.dncProps.text ? dnc.dncProps.text.length : 0;
        
        if (props.viewDistance !== undefined) {
            this.writeFloat32ToRawData(dnc.rawData, dataBegin + textLength + 60, props.viewDistance);
        }
        if (props.cameraDistance !== undefined) {
            this.writeFloat32ToRawData(dnc.rawData, dataBegin + textLength + 50, props.cameraDistance);
        }
        if (props.nearClipping !== undefined) {
            this.writeFloat32ToRawData(dnc.rawData, dataBegin + textLength + 70, props.nearClipping);
        }
        if (props.farClipping !== undefined) {
            this.writeFloat32ToRawData(dnc.rawData, dataBegin + textLength + 74, props.farClipping);
        }
        
        // Update dncProps to reflect changes
        this.populateProps(dnc);
    }
    
    // Rebuild the entire binary file from scene2Data
    saveScene() {
        const sections = [];
        
        // Write header
        if (this.scene2Data.header.content) {
            const headerMagic = this.scene2Data.header.magic;
            const headerSize = this.scene2Data.header.size;
            const headerContent = this.scene2Data.header.content;
            
            sections.push(...headerMagic);
            sections.push(...headerSize);
            sections.push(...headerContent.rawData);
        }
        
        // Write sections
        this.scene2Data.sections.forEach(section => {
            // Write section ID
            sections.push(...section.sectionIdArr);
            
            // Write section length (will be updated later)
            const sectionLengthPos = sections.length;
            sections.push(0, 0, 0, 0);
            
            // Write all DNCs in this section
            section.dncs.forEach(dnc => {
                // Write DNC ID
                sections.push(...dnc.objectIDArr);
                
                // Write DNC length
                const dncLength = dnc.rawData.length + dnc.objectIDArr.length;
                sections.push(...ByteUtils.fromInt32(dncLength));
                
                // Write DNC data
                sections.push(...dnc.rawData);
            });
            
            // Update section length
            const sectionLength = sections.length - sectionLengthPos;
            const lengthBytes = ByteUtils.fromInt32(sectionLength);
            for (let i = 0; i < 4; i++) {
                sections[sectionLengthPos + i] = lengthBytes[i];
            }
        });
        
        return new Uint8Array(sections).buffer;
    }
}

