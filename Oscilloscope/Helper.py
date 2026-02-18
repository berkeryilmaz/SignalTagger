import re

class Helper:
    VOLTAGE_REGEX_PATTERN = r'(\d+(\.\d+)?)\s*([a-zA-Zµ]+)?'
    VOLTAGE_CONVERT_COEFF = {
        'mV': 0.001,
        'V': 1,
        'KV': 1000
    }

    @staticmethod
    def separateValueAndUnit(voltage_string):
        match = re.match(Helper.VOLTAGE_REGEX_PATTERN, voltage_string)
        value = float(match.group(1))
        unit = match.group(3)

        return value, unit

    @staticmethod
    def parseVoltage(voltage_string):
        value, unit = Helper.separateValueAndUnit(voltage_string)
        return value * Helper.VOLTAGE_CONVERT_COEFF[unit]

    @staticmethod
    def parseProbeMultipler(probe_string):
        return int(probe_string.replace('x','').replace('X',''))