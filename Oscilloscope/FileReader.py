import numpy as np
import json
from Oscilloscope.OscilloscopeSetup import OscilloscopeSetup
import binascii


def decimal_to_hex(decimal_value):
    # Ondalık sayıyı hexadecimal'e dönüştür
    hex_value = hex(decimal_value).upper()

    # `0x` önekini ve gereksiz boşlukları temizle
    hex_value = hex_value[2:]  # `0x` kısmını kes
    hex_value = hex_value.rjust(8, '0')  # 8 basamaklı yap

    return f"0x{hex_value}"


class FileReader:
    def __init__(self, filepath=None):
        self.filePath = filepath
        self.fileData = ''
        with open(self.filePath, "rb") as data_file:
            self.fileData = data_file.read()

    def readFileInfo(self):
        oscilloscope_setup_str = self.fileData.decode('unicode_escape').split('\x00')[2]
        oscilloscope_setup_dict = json.loads(oscilloscope_setup_str[oscilloscope_setup_str.find('{'):oscilloscope_setup_str.rfind('}')+1])
        oscilloscope_setup = OscilloscopeSetup(oscilloscope_setup_dict)

        data_split_str = 0xf0050000.to_bytes(4, "big")
        if oscilloscope_setup.sample.datalen == 1520:
            data_split_str = 0xe00b0000.to_bytes(4, "big")

        split_data = self.fileData.split(data_split_str)

        split_data_length = len(split_data)
        for i, channel in enumerate(oscilloscope_setup.channel):
            if (split_data_length > 1 + i):
                byte_data = np.frombuffer(split_data[1 + i], dtype=np.int16)[:oscilloscope_setup.sample.datalen]
                channel.raw_data = list(byte_data)
                channel.setData(byte_data)
                channel.successful_read = True
            else:
                channel.raw_data = [0] * oscilloscope_setup.sample.datalen
                channel.setData(channel.raw_data)
        return oscilloscope_setup

    def readFromJson(self):
        oscilloscope_setup_dict = json.loads(self.fileData)
        oscilloscope_setup = OscilloscopeSetup(oscilloscope_setup_dict)
        return oscilloscope_setup
