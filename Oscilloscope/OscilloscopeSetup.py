from Oscilloscope.TimeBase import TimeBase
from Oscilloscope.Sample import Sample
from Oscilloscope.Channel import Channel
from Oscilloscope.Trig import Trig

class OscilloscopeSetup:
    def __init__(self, setup_dict):
        setup_dict = {key.lower(): setup_dict[key] for key in setup_dict}
        self.timebase = TimeBase(setup_dict['timebase'])
        self.sample = Sample(setup_dict['sample'])
        self.channel = [Channel(ch) for ch in setup_dict['channel']]
        self.datatype = setup_dict['datatype']
        self.runstatus = setup_dict['runstatus']
        self.idn = setup_dict['idn']
        self.model = setup_dict['model']
        #self.trig = Trig(setup_dict['trig'])
