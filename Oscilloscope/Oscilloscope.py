from Oscilloscope.FileReader import FileReader
import json
import os
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches


class Oscilloscope:
    def __init__(self, file_paths=[]):
        self.file_paths = None
        self.files = None
        self.timebase = None
        self.sample = None
        self.channel = None
        self.datatype = None
        self.runstatus = None
        self.idn = None
        self.model = None
        self.trig = None

        if (len(file_paths)):
            self.file_paths = file_paths
            self.files = self.getRecordFiles()
            merged_file = self.mergeRecordFiles()
            self.setOscilloscopeParams(merged_file.__dict__)

    def getRecordFiles(self):
        record_files = []
        for file_path in self.file_paths:
            file = FileReader(file_path).readFileInfo()
            record_files.append(file)
        return record_files

    def mergeRecordFiles(self):
        firstFile = self.files[0]
        for currentFile in self.files[1:]:
            for i, channel in enumerate(currentFile.channel):
                firstFile.channel[i].data += channel.data
                firstFile.channel[i].raw_data += channel.raw_data
        return firstFile

    def setOscilloscopeParams(self, param_dict):
        for attr, value in param_dict.items():
            setattr(self, attr, value)

    @property
    def __dict__(self):
        return {
            'file_paths': self.file_paths,
            'timebase': self.timebase.__dict__,
            'sample': self.sample.__dict__,
            'channel': [ch.__dict__ for ch in self.channel],
            'datatype': self.datatype,
            'runstatus': self.runstatus,
            'idn': self.idn,
            'model': self.model,
            'trig': None
        }

    def saveAsJson(self, filePath):
        json_object = json.dumps(self.__dict__, indent=4)
        os.makedirs(os.path.dirname(filePath), exist_ok=True)
        with open(filePath, "w") as outfile:
            outfile.write(json_object)

    @staticmethod
    def loadFromJson(json_path):
        fileObj = FileReader(json_path)
        fileData = fileObj.readFromJson()
        osciloscope = Oscilloscope()
        osciloscope.setOscilloscopeParams(fileData.__dict__)
        return osciloscope

    def getActiveChannel(self):
        return [channel for channel in self.channel if channel.display == 'ON']

    def showOscilloscopeScreen(self, frame=0,fileName = None):
        ylimit = 2000
        plt.figure(figsize=(12, 8))
        plt.ylim(-ylimit, ylimit)
        plt.xlim(0, self.sample.datalen)
        yticks = []
        xticks = []
        for i in range(0, 11):
            y = -ylimit + i * 2 * ylimit / 10
            yticks.append(y)

        for i in range(0, 15):
            x = 25*self.sample.datalen/760 + i * self.sample.datalen / 15
            xticks.append(x)

        plt.axhline(y=0, color='gray')
        plt.axvline(x=self.sample.datalen/2, color='gray')

        div_info = []
        plt.tick_params(
            axis='both',  # changes apply to the x-axis
            which='both',  # both major and minor ticks are affected
            bottom=True,  # ticks along the bottom edge are off
            top=True,  # ticks along the top edge are off
            left=True,  # ticks along the bottom edge are off
            right=True,  # ticks along the top edge are off

            labelbottom=False,
            labelleft=False
        )

        plt.gca().set_yticks(yticks)

        plt.gca().set_xticks(xticks)

        for channel in self.getActiveChannel():
            plt.plot(channel.raw_data[frame * self.sample.datalen:(frame + 1) * self.sample.datalen], linewidth=1, label=channel.name)
            div_info.append(mpatches.Patch(color='white', label=f"{channel.probe}{channel.scale} ({channel.name})  / div"))

        plt.gca().grid(which='major', alpha=0.5)
        div_info.append(mpatches.Patch(color='lightgray', label=f"{self.timebase.scale} / div"))
        handles, labels = plt.gca().get_legend_handles_labels()
        handles.extend(div_info)
        plt.legend(handles=handles)

        if fileName :
            os.makedirs(os.path.dirname(fileName), exist_ok=True)
            plt.savefig(fileName)
            plt.close('all')
        else:
            plt.show(block=True)